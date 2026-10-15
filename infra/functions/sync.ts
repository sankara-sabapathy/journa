export interface LambdaEvent {
  rawPath?: string
  requestContext?: {
    http?: {
      method?: string
    }
  }
  body?: string | null
}

/**
 * First backend scaffold. It proves the HTTP API route wiring and deploy shape.
 * Real DynamoDB/S3 implementations land in the next phase, after synthetic
 * tests pin the wire contract.
 */
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
    return response(200, {
      uploadUrl: 'https://example.invalid/not-implemented',
      uploadMethod: 'PUT',
    })
  }

  if (method === 'GET' && path === '/v1/backups') {
    return response(200, { backups: [] })
  }

  if (method === 'DELETE' && path.startsWith('/v1/backups/')) {
    return response(204, '')
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