import {
  generateDeviceKeypair,
  randomDataKey,
  unwrapDataKey,
  wrapDataKey,
  type WrappedDataKey,
} from './deviceKeys'
import { AppError } from '../app/errors'
import { getAccessToken } from './engine'

const IDENTITY_KEY = 'device.identity'
const DEK_KEY = 'device.dek'

export interface DeviceIdentity {
  deviceId: string
  publicJwk: JsonWebKey
  privateJwk: JsonWebKey
}

export interface DeviceRecord {
  deviceId: string
  publicKeyJwk: JsonWebKey | null
  label: string
  createdAt: number
}

interface StoredDek {
  rawB64: string
}

function toB64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function apiBase(): string | null {
  const url = import.meta.env.VITE_JOURNA_API_URL ?? null
  return url ? String(url).replace(/\/$/, '') : null
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const base = apiBase()
  if (!base) throw new Error('sync-backend-not-configured')
  const token = await getAccessToken()
  if (!token) throw new Error('account-not-signed-in')
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`sync-http-${response.status}`)
  return response
}

async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
}

async function readIdentity(): Promise<DeviceIdentity | null> {
  const { db } = await import('../db/db')
  const row = await db.settings.get(IDENTITY_KEY)
  return (row?.value ?? null) as DeviceIdentity | null
}

async function writeIdentity(identity: DeviceIdentity): Promise<void> {
  const { db } = await import('../db/db')
  await db.settings.put({ key: IDENTITY_KEY, value: identity })
}

export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await readIdentity()
  if (existing) return existing
  const keypair = await generateDeviceKeypair()
  const privateJwk = await crypto.subtle.exportKey('jwk', keypair.privateKey)
  const identity = { deviceId: keypair.deviceId, publicJwk: keypair.publicJwk, privateJwk }
  await writeIdentity(identity)
  return identity
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const response = await call('/v1/devices', { method: 'GET' })
  const json = (await response.json()) as { devices?: DeviceRecord[] }
  return json.devices ?? []
}

async function fetchWrap(deviceId: string): Promise<WrappedDataKey | null> {
  const response = await fetch(`${apiBase()}/v1/devices/${encodeURIComponent(deviceId)}/dek`, {
    headers: { authorization: `Bearer ${await getAccessToken()}` },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`sync-http-${response.status}`)
  const json = (await response.json()) as { wrap?: string }
  return json.wrap ? (JSON.parse(json.wrap) as WrappedDataKey) : null
}

async function readDek(): Promise<Uint8Array<ArrayBuffer> | null> {
  const { db } = await import('../db/db')
  const row = await db.settings.get(DEK_KEY)
  const stored = (row?.value ?? null) as StoredDek | null
  return stored ? fromB64Url(stored.rawB64) : null
}

async function writeDek(raw: Uint8Array<ArrayBuffer>): Promise<void> {
  const { db } = await import('../db/db')
  await db.settings.put({ key: DEK_KEY, value: { rawB64: toB64Url(raw) } satisfies StoredDek })
}

/** One enrollment result for every outcome, so the panel and sync agree. */
export type EnrollmentResult =
  | { status: 'ready'; dek: Uint8Array<ArrayBuffer> }
  | { status: 'waiting' }
  | { status: 'first'; dek: Uint8Array<ArrayBuffer>; recoveryKey: string }

export const APPROVAL_POLL_MS = 15_000

async function registerIfMissing(label: string): Promise<DeviceIdentity> {
  const identity = await ensureDeviceIdentity()
  await call(`/v1/devices/${encodeURIComponent(identity.deviceId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKeyJwk: identity.publicJwk, label }),
  })
  return identity
}

async function unwrapStoredWrap(deviceId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const identity = await ensureDeviceIdentity()
  const wrap = await fetchWrap(deviceId)
  if (!wrap) return null
  // The wrap names its recipient; never unwrap a wrap minted for another device.
  if (wrap.recipientId !== identity.deviceId) throw new AppError('error.unknownDevice')
  const privateKey = await importPrivateKey(identity.privateJwk)
  const dek = await unwrapDataKey(wrap, privateKey)
  await writeDek(dek)
  return dek
}

export async function ensureEnrolled(label: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const identity = await registerIfMissing(label)
  const local = await readDek()
  if (local) return local
  return unwrapStoredWrap(identity.deviceId)
}

export async function approveDevice(deviceId: string, dek: Uint8Array<ArrayBuffer>): Promise<void> {
  const devices = await listDevices()
  const target = devices.find((d) => d.deviceId === deviceId)
  if (!target?.publicKeyJwk) throw new AppError('error.unknownDevice')
  const wrap = await wrapDataKey(dek, target.publicKeyJwk)
  await call(`/v1/devices/${encodeURIComponent(deviceId)}/dek`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wrap: JSON.stringify(wrap) }),
  })
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await call(`/v1/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

export async function deleteAccount(): Promise<void> {
  await call('/v1/account', { method: 'DELETE' })
}

async function mintFirstDeviceKey(): Promise<{ dek: Uint8Array<ArrayBuffer>; recoveryKey: string }> {
  const identity = await ensureDeviceIdentity()
  const dek = await randomDataKey()
  await writeDek(dek)
  const wrap = await wrapDataKey(dek, identity.publicJwk)
  await call(`/v1/devices/${encodeURIComponent(identity.deviceId)}/dek`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wrap: JSON.stringify(wrap) }),
  })
  return { dek, recoveryKey: toB64Url(dek) }
}

/**
 * One place decides what "can sync" means. Every outcome is explicit: the
 * device has a key, it is waiting on a trusted device, or it just minted the
 * account's first key and must back up the recovery key.
 */
export async function enrollDevice(label: string): Promise<EnrollmentResult> {
  const dek = await ensureEnrolled(label)
  if (dek) return { status: 'ready', dek }
  const identity = await ensureDeviceIdentity()
  const peers = (await listDevices()).filter((d) => d.deviceId !== identity.deviceId)
  if (peers.length === 0) {
    const first = await mintFirstDeviceKey()
    return { status: 'first', ...first }
  }
  return { status: 'waiting' }
}

const RECOVERY_ACK_KEY = 'device.recoveryAck'

export async function hasAcknowledgedRecovery(): Promise<boolean> {
  const { db } = await import('../db/db')
  const row = await db.settings.get(RECOVERY_ACK_KEY)
  return row?.value === true
}

export async function acknowledgeRecovery(): Promise<void> {
  const { db } = await import('../db/db')
  await db.settings.put({ key: RECOVERY_ACK_KEY, value: true })
}

export async function exportRecoveryKey(): Promise<string | null> {
  const dek = await readDek()
  return dek ? toB64Url(dek) : null
}

export async function importRecoveryKey(key: string): Promise<Uint8Array<ArrayBuffer>> {
  const dek = fromB64Url(key.trim())
  if (dek.length !== 32) throw new AppError('error.invalidRecoveryKey')
  await writeDek(dek)
  return dek
}

export async function localDataKey(): Promise<Uint8Array<ArrayBuffer> | null> {
  return readDek()
}

/** Legacy helper kept for the engine: null also means "waiting". */
export async function resolveDataKey(label: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const result = await enrollDevice(label)
  return result.status === 'ready' ? result.dek : null
}
