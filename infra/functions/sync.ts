import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export interface LambdaEvent {
  rawPath?: string
  pathParameters?: Record<string, string> | null
  requestContext?: {
    http?: {
      method?: string
    }
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>
      }
    }
  }
  body?: string | null
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
const s3 = new S3Client({})
const tableName = (): string => process.env.TABLE_NAME ?? ''
const backupsBucket = (): string => process.env.BACKUPS_BUCKET_NAME ?? ''

const BACKUP_NAME_RE = /^journa-backup-\d{8}-\d{6}\.(json|jbak)$/
const backupPrefix = (sub: string): string => `backups/${sub}/`

const deviceSk = (id: string): string => `DEVICE#${id}`
const dekSk = (id: string): string => `DEKWRAP#${id}`
const userPk = (sub: string): string => `USER#${sub}`

function subOf(event: LambdaEvent): string | null {
  const claims = event.requestContext?.authorizer?.jwt?.claims
  const sub = claims?.['sub']
  return typeof sub === 'string' && sub.length > 0 ? sub : null
}

function issuerOf(event: LambdaEvent): string {
  const claims = event.requestContext?.authorizer?.jwt?.claims
  const iss = claims?.['iss']
  return typeof iss === 'string' && iss.length > 0 ? iss : 'unknown-issuer'
}

function verifiedEmailOf(event: LambdaEvent): string | null {
  const claims = event.requestContext?.authorizer?.jwt?.claims
  const verified = claims?.['email_verified']
  const email = claims?.['email']
  if ((verified === true || verified === 'true') && typeof email === 'string' && email.length > 0) return email
  return null
}

const idpPk = (iss: string, sub: string): string => `IDP#${iss}#${sub}`
const emailPk = (email: string): string => `EMAIL#${email.toLowerCase()}`

function newUserId(): string {
  return crypto.randomUUID()
}

/**
 * Stable internal user id, decoupled from any single user pool. First call
 * mints one and links the pool's sub; a later pool can link by verified email,
 * so pool migration keeps every row and every S3 object in place.
 */
async function resolveUserId(event: LambdaEvent): Promise<string | null> {
  const sub = subOf(event)
  if (!sub) return null
  const iss = issuerOf(event)
  const email = verifiedEmailOf(event)
  const table = tableName()
  if (!table) return null

  const direct = await ddb.send(new GetCommand({ TableName: table, Key: { pk: idpPk(iss, sub), sk: 'LINK' } }))
  if (typeof direct.Item?.['userId'] === 'string') return direct.Item['userId'] as string

  if (email) {
    const byEmail = await ddb.send(new GetCommand({ TableName: table, Key: { pk: emailPk(email), sk: 'LINK' } }))
    if (typeof byEmail.Item?.['userId'] === 'string') {
      const userId = byEmail.Item['userId'] as string
      await ddb.send(new PutCommand({ TableName: table, Item: { pk: idpPk(iss, sub), sk: 'LINK', userId } }))
      return userId
    }
  }

  const userId = newUserId()
  await ddb.send(new PutCommand({ TableName: table, Item: { pk: idpPk(iss, sub), sk: 'LINK', userId } }))
  if (email) {
    await ddb.send(new PutCommand({ TableName: table, Item: { pk: emailPk(email), sk: 'LINK', userId } }))
  }
  return userId
}

function deviceIdOf(event: LambdaEvent): string | null {
  const fromParams = event.pathParameters?.['id']
  if (fromParams && fromParams.length > 0) return fromParams
  const path = event.rawPath ?? ''
  const m = path.match(/^\/v1\/devices\/([^/]+)(?:\/dek)?$/)
  return m ? decodeURIComponent(m[1]) : null
}

function validDeviceId(id: string): boolean {
  return id.length >= 1 && id.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(id)
}

function parseBody(event: LambdaEvent): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value = event.body ? JSON.parse(event.body) : {}
    if (typeof value !== 'object' || value === null) return { ok: false }
    return { ok: true, value: value as Record<string, unknown> }
  } catch {
    return { ok: false }
  }
}

export const handler = async (event: LambdaEvent): Promise<{
  statusCode: number
  headers: Record<string, string>
  body: string
}> => {
  const method = event.requestContext?.http?.method ?? 'GET'
  const path = event.rawPath ?? '/'

  if (method === 'POST' && path === '/v1/sync') {
    let request: unknown = {}
    try {
      request = event.body ? JSON.parse(event.body) : {}
    } catch {
      return response(400, { error: 'invalid-body' })
    }

    return response(200, {
      cursor: 0,
      pull: [],
      applied: 0,
      skipped: 0,
      received: Array.isArray((request as { push?: unknown }).push) ? (request as { push: unknown[] }).push.length : 0,
    })
  }

  if (method === 'POST' && path === '/v1/backups/presign') {
    const sub = await resolveUserId(event)
    if (!sub) return response(401, { error: 'unauthorized' })
    const bucket = backupsBucket()
    if (!bucket) return response(500, { error: 'misconfigured' })
    const parsed = parseBody(event)
    const name = parsed.ok && typeof parsed.value['name'] === 'string' ? parsed.value['name'] : ''
    if (!BACKUP_NAME_RE.test(name)) return response(400, { error: 'invalid-backup-name' })
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: `${backupPrefix(sub)}${name}`, ContentType: 'application/json' }),
      { expiresIn: 300 },
    )
    return response(200, { uploadUrl, uploadMethod: 'PUT' })
  }

  if (method === 'GET' && path === '/v1/backups') {
    const sub = await resolveUserId(event)
    if (!sub) return response(401, { error: 'unauthorized' })
    const bucket = backupsBucket()
    if (!bucket) return response(500, { error: 'misconfigured' })
    const out = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: backupPrefix(sub) }))
    const backups = (out.Contents ?? [])
      .map((o) => (o.Key ?? '').slice(backupPrefix(sub).length))
      .filter((name) => BACKUP_NAME_RE.test(name))
      .sort()
    return response(200, { backups })
  }

  if (method === 'DELETE' && path.startsWith('/v1/backups/')) {
    const sub = await resolveUserId(event)
    if (!sub) return response(401, { error: 'unauthorized' })
    const bucket = backupsBucket()
    if (!bucket) return response(500, { error: 'misconfigured' })
    const name = decodeURIComponent(path.slice('/v1/backups/'.length))
    if (!BACKUP_NAME_RE.test(name)) return response(400, { error: 'invalid-backup-name' })
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `${backupPrefix(sub)}${name}` }))
    return response(204, '')
  }

  if (path === '/v1/devices' || path.startsWith('/v1/devices/')) {
    const sub = await resolveUserId(event)
    if (!sub) return response(401, { error: 'unauthorized' })
    const table = tableName()
    if (!table) return response(500, { error: 'misconfigured' })
    const pk = userPk(sub)

    if (method === 'GET' && path === '/v1/devices') {
      const out = await ddb.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: { ':pk': pk, ':prefix': 'DEVICE#' },
        }),
      )
      const devices = (out.Items ?? [])
        .filter((item) => (item['revokedAt'] ?? 0) === 0)
        .map((item) => ({
          deviceId: item['deviceId'] as string,
          publicKeyJwk: ((item['publicKeyJwk'] ?? null) as Record<string, unknown> | null),
          label: (item['label'] as string) ?? '',
          createdAt: (item['createdAt'] as number) ?? 0,
        }))
      return response(200, { devices })
    }

    if (method === 'PUT' && path.endsWith('/dek')) {
      const id = deviceIdOf(event)
      if (!id || !validDeviceId(id)) return response(400, { error: 'invalid-device-id' })
      const parsed = parseBody(event)
      if (!parsed.ok || typeof parsed.value['wrap'] !== 'string' || (parsed.value['wrap'] as string).length === 0) {
        return response(400, { error: 'invalid-wrap' })
      }
      let wrap: unknown
      try {
        wrap = JSON.parse(parsed.value['wrap'] as string)
      } catch {
        return response(400, { error: 'invalid-wrap' })
      }
      if (
        typeof wrap !== 'object' ||
        wrap === null ||
        (wrap as Record<string, unknown>)['recipientId'] !== id ||
        typeof (wrap as Record<string, unknown>)['dataB64'] !== 'string'
      ) {
        return response(400, { error: 'wrap-device-mismatch' })
      }
      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: {
            pk,
            sk: dekSk(id),
            deviceId: id,
            wrap: parsed.value['wrap'],
            updatedAt: Date.now(),
          },
        }),
      )
      return response(200, { deviceId: id })
    }

    if (method === 'GET' && path.endsWith('/dek')) {
      const id = deviceIdOf(event)
      if (!id || !validDeviceId(id)) return response(400, { error: 'invalid-device-id' })
      const out = await ddb.send(new GetCommand({ TableName: table, Key: { pk, sk: dekSk(id) } }))
      if (!out.Item) return response(404, { error: 'not-found' })
      return response(200, { deviceId: id, wrap: out.Item['wrap'] })
    }

    if (method === 'PUT' && path.startsWith('/v1/devices/')) {
      const id = deviceIdOf(event)
      if (!id || !validDeviceId(id)) return response(400, { error: 'invalid-device-id' })
      const parsed = parseBody(event)
      if (!parsed.ok) return response(400, { error: 'invalid-public-key' })
      const publicKeyJwk = parsed.value['publicKeyJwk'] as Record<string, unknown> | null
      if (
        typeof publicKeyJwk !== 'object' ||
        publicKeyJwk === null ||
        publicKeyJwk['kty'] !== 'EC' ||
        typeof publicKeyJwk['x'] !== 'string' ||
        typeof publicKeyJwk['y'] !== 'string'
      ) {
        return response(400, { error: 'invalid-public-key' })
      }
      const label = typeof parsed.value['label'] === 'string' ? (parsed.value['label'] as string).slice(0, 128) : ''
      const existing = await ddb.send(new GetCommand({ TableName: table, Key: { pk, sk: deviceSk(id) } }))
      const createdAt = typeof existing.Item?.['createdAt'] === 'number' ? (existing.Item['createdAt'] as number) : Date.now()
      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: { pk, sk: deviceSk(id), deviceId: id, publicKeyJwk: parsed.value['publicKeyJwk'], label, createdAt, revokedAt: 0 },
        }),
      )
      return response(200, { deviceId: id, label, createdAt })
    }

    if (method === 'DELETE' && path.startsWith('/v1/devices/')) {
      const id = deviceIdOf(event)
      if (!id || !validDeviceId(id)) return response(400, { error: 'invalid-device-id' })
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: table,
            Key: { pk, sk: deviceSk(id) },
            UpdateExpression: 'SET revokedAt = :now',
            ConditionExpression: 'attribute_exists(pk)',
            ExpressionAttributeValues: { ':now': Date.now() },
          }),
        )
      } catch {
        return response(404, { error: 'not-found' })
      }
      return response(200, { deviceId: id, revoked: true })
    }
  }

  return response(404, { error: 'not-found', method, path })
}

function response(statusCode: number, body: unknown): {
  statusCode: number
  headers: Record<string, string>
  body: string
} {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
