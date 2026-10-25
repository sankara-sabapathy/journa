import { BACKUP_VERSION, type EncryptedBackup } from './format'

const ITERATIONS = 310_000

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(plaintext: string, passphrase: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return {
    app: 'journa',
    encrypted: true,
    version: BACKUP_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(new Uint8Array(data)),
  }
}

export class WrongPassphraseError extends Error {}

export async function decryptText(file: EncryptedBackup, passphrase: string): Promise<string> {
  if (typeof file.kdf.iterations !== 'number' || file.kdf.iterations < 100_000) throw new WrongPassphraseError()
  const key = await deriveKey(passphrase, fromB64(file.kdf.salt), file.kdf.iterations)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(file.cipher.iv) },
      key,
      fromB64(file.data),
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new WrongPassphraseError()
  }
}
