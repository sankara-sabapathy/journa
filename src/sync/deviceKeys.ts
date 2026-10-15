import type { Entry } from '../db/types'
import { entrySchema } from '../backup/format'

const WRAP_INFO = 'journa-dek-wrap-v1'

export interface DeviceKeypair {
  privateKey: CryptoKey
  publicJwk: JsonWebKey
  deviceId: string
}

export interface WrappedDataKey {
  recipientId: string
  saltB64: string
  ivB64: string
  dataB64: string
  ephPubJwk: JsonWebKey
}

export interface SealedEntry {
  id: string
  updatedAt: number
  deletedAt: number
  ivB64: string
  dataB64: string
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

async function publicJwkToDeviceId(jwk: JsonWebKey): Promise<string> {
  const x = fromB64Url(jwk.x ?? '')
  const y = fromB64Url(jwk.y ?? '')
  const raw = new Uint8Array(x.length + y.length)
  raw.set(x)
  raw.set(y, x.length)
  const digest = await crypto.subtle.digest('SHA-256', raw)
  return toB64Url(new Uint8Array(digest)).slice(0, 22)
}

export async function generateDeviceKeypair(): Promise<DeviceKeypair> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ])
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const deviceId = await publicJwkToDeviceId(publicJwk)
  return { privateKey: pair.privateKey, publicJwk, deviceId }
}

export async function randomDataKey(): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return fromB64Url(jwk.k ?? '')
}

async function wrappingKey(
  privateKey: CryptoKey,
  publicJwk: JsonWebKey,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const ikm = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(WRAP_INFO) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function wrapDataKey(
  dekRaw: Uint8Array<ArrayBuffer>,
  recipientPublicJwk: JsonWebKey,
): Promise<WrappedDataKey> {
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPubJwk = await crypto.subtle.exportKey('jwk', eph.publicKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await wrappingKey(eph.privateKey, recipientPublicJwk, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dekRaw)
  const recipientId = await publicJwkToDeviceId(recipientPublicJwk)
  return {
    recipientId,
    saltB64: toB64Url(salt),
    ivB64: toB64Url(iv),
    dataB64: toB64Url(new Uint8Array(data)),
    ephPubJwk,
  }
}

export async function unwrapDataKey(
  wrap: WrappedDataKey,
  recipientPrivateKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await wrappingKey(recipientPrivateKey, wrap.ephPubJwk, fromB64Url(wrap.saltB64))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64Url(wrap.ivB64) },
    key,
    fromB64Url(wrap.dataB64),
  )
  return new Uint8Array(plain)
}

async function importDek(dekRaw: Uint8Array<ArrayBuffer>, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, [usage])
}

export async function sealEntry(dekRaw: Uint8Array<ArrayBuffer>, entry: Entry): Promise<SealedEntry> {
  const key = await importDek(dekRaw, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(entry)),
  )
  return {
    id: entry.id,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    ivB64: toB64Url(iv),
    dataB64: toB64Url(new Uint8Array(data)),
  }
}

export async function openEntry(dekRaw: Uint8Array<ArrayBuffer>, sealed: SealedEntry): Promise<Entry> {
  const key = await importDek(dekRaw, 'decrypt')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64Url(sealed.ivB64) },
    key,
    fromB64Url(sealed.dataB64),
  )
  const entry = entrySchema.parse(JSON.parse(new TextDecoder().decode(plain)))
  if (entry.id !== sealed.id || entry.updatedAt !== sealed.updatedAt || entry.deletedAt !== sealed.deletedAt) {
    throw new Error('entry metadata mismatch')
  }
  return entry
}
