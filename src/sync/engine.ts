import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { onChange } from '../db/repo'
import type { Entry } from '../db/types'
import { openEntry, sealEntry } from './deviceKeys'
import { resolveDataKey } from './devices'
import { selectWinningEntries } from './merge'
import { syncRequestSchema, syncResponseSchema, type AccountState, type SyncItem, type UserId } from './types'
import * as auth from './auth'

const TOKENS_KEY = 'auth.tokens'
const ACCOUNT_KEY = 'auth.account'
const CURSOR_KEY = 'sync.cursor'

type StoredCredentials = auth.CloudCredentials

let state: AccountState = { status: 'signed-out' }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function update(next: AccountState) {
  state = next
  emit()
}

function credentialsAccount(credentials: StoredCredentials, lastSyncAt: number | null, dirtyCount = 0): Extract<AccountState, { status: 'idle' }> {
  return {
    status: 'idle',
    userId: userIdFromToken(credentials.idToken),
    email: emailFromToken(credentials.idToken),
    lastSyncAt,
    dirtyCount,
  }
}

function userIdFromToken(token: string): UserId {
  const payload = decodeJwt(token)
  return ((payload?.sub ?? 'unknown') as string) as UserId
}

function emailFromToken(token: string): string {
  const payload = decodeJwt(token)
  return typeof payload?.email === 'string' ? payload.email : ''
}

function decodeJwt(token: string): Record<string, unknown> | null {
  if (!token || !token.includes('.')) return null
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function apiBaseUrl(): string | null {
  return import.meta.env.VITE_JOURNA_API_URL ?? null
}

async function storedCredentials(): Promise<StoredCredentials | null> {
  const row = await db.settings.get(TOKENS_KEY)
  if (!row) return null
  return row.value as StoredCredentials
}

async function clearStoredCredentials() {
  await db.settings.delete(TOKENS_KEY)
  await db.settings.delete(ACCOUNT_KEY)
}

async function storedLastSyncAt(): Promise<number | null> {
  const row = await db.settings.get(ACCOUNT_KEY)
  if (!row) return null
  const value = row.value as unknown
  if (typeof value !== 'object' || value === null || !('lastSyncAt' in value)) return null
  return Number((value as { lastSyncAt: unknown }).lastSyncAt)
}

async function putSettings(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

async function refreshIfNeeded(credentials: StoredCredentials): Promise<StoredCredentials> {
  if (credentials.expiresAt > Date.now() + 60_000) return credentials
  const refreshed = await auth.refreshCredentials(credentials.refreshToken)
  await putSettings(TOKENS_KEY, refreshed)
  return refreshed
}

export async function getAccessToken(): Promise<string | null> {
  const credentials = await storedCredentials()
  if (!credentials) return null
  try {
    const fresh = await refreshIfNeeded(credentials)
    return fresh.accessToken
  } catch {
    return null
  }
}

export async function start() {
  const credentials = await storedCredentials()
  if (!credentials) {
    update({ status: 'signed-out' })
    return
  }
  const fallback = credentialsAccount(credentials, null)
  update({ status: 'syncing', userId: fallback.userId, email: fallback.email, lastSyncAt: null })
  try {
    const fresh = await refreshIfNeeded(credentials)
    const lastSyncAt = await storedLastSyncAt()
    update(credentialsAccount(fresh, lastSyncAt))
  } catch {
    await clearStoredCredentials()
    update({ status: 'signed-out' })
  }
}

export async function beginEmailSignIn(email: string) {
  const session = await auth.beginEmailSignIn(email)
  update({ status: 'awaiting-otp', email, session })
}

export async function verifyEmailOtp(code: string) {
  if (state.status !== 'awaiting-otp') throw new Error('not-awaiting-otp')
  const credentials = await auth.verifyEmailSignIn(state.email, state.session, code)
  await putSettings(TOKENS_KEY, credentials)
  await putSettings(ACCOUNT_KEY, { lastSyncAt: null })
  update(credentialsAccount(credentials, null))
}

export async function signInWithPasskey() {
  if (!auth.supportsPasskeys()) throw new Error('passkeys-unsupported')
  await auth.passkeyChallenge('')
  throw new Error('passkey-response-not-wired')
}

export async function registerPasskey() {
  if (state.status === 'signed-out' || state.status === 'awaiting-otp') throw new Error('account-not-signed-in')
}

export async function signOut() {
  if (state.status === 'signed-out' || state.status === 'awaiting-otp') return
  await clearStoredCredentials()
  update({ status: 'signed-out' })
}

export async function syncNow(): Promise<boolean> {
  if (state.status !== 'idle' && state.status !== 'error') return false
  const credentials = await storedCredentials()
  if (!credentials) return false
  const baseUrl = apiBaseUrl()
  if (!baseUrl) return false

  let userId: UserId
  let email: string
  let lastSyncAt: number | null
  if (state.status === 'idle' || state.status === 'error') {
    userId = state.userId
    email = state.email
    lastSyncAt = state.lastSyncAt
  } else {
    const fallback = credentialsAccount(credentials, null)
    userId = fallback.userId
    email = fallback.email
    lastSyncAt = null
  }

  update({ status: 'syncing', userId, email, lastSyncAt })

  try {
    const freshCredentials = await refreshIfNeeded(credentials)
    let dek: Uint8Array<ArrayBuffer> | null = await resolveDataKey('Journa device')
    if (!dek) {
      update({ status: 'error', userId, email, lastSyncAt, error: 'sync-device-not-enrolled' })
      return false
    }
    const entries = await db.entries.toArray()
    const outboxRows = await db.outbox.toArray()
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const push: SyncItem[] = await Promise.all(
      outboxRows
        .map((row) => byId.get(row.id))
        .filter((entry): entry is Entry => Boolean(entry))
        .slice(0, 100)
        .map(async (entry) => {
          const cipher = await sealEntry(dek, entry)
          return { kind: 'encrypted', id: entry.id, updatedAt: entry.updatedAt, deletedAt: entry.deletedAt, cipher }
        }),
    )

    // Pull in rounds until the server has nothing new: a fresh device with
    // years of entries needs several capped pages to converge in one sync.
    const MAX_PULL_ROUNDS = 6
    let rounds = 0
    for (;;) {
      const cursor = await rememberedCursor()
      const requestBody = syncRequestSchema.parse({ cursor, push: rounds === 0 ? push : [] })
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${freshCredentials.accessToken}`,
        },
        body: JSON.stringify(requestBody),
      })
      if (response.status === 401) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null
        if (body?.error === 'account-deleted') {
          await clearStoredCredentials()
          update({ status: 'signed-out' })
          return false
        }
        throw new Error('sync-http-401')
      }
      if (!response.ok) throw new Error(`sync-http-${response.status}`)

      const json = await response.json()
      const parsed = syncResponseSchema.parse(json)
      await putSettings(CURSOR_KEY, parsed.cursor)
      await applyPulledEntries(entries, parsed.pull, dek)
      if (rounds === 0 && push.length > 0) await db.outbox.bulkDelete(push.map((item) => item.id))
      rounds += 1
      if (parsed.pull.length === 0 || rounds >= MAX_PULL_ROUNDS) break
    }
    const nextLastSyncAt = Date.now()
    await putSettings(ACCOUNT_KEY, { lastSyncAt: nextLastSyncAt })
    const dirtyCount = await db.outbox.count()
    update({ status: 'idle', userId, email, lastSyncAt: nextLastSyncAt, dirtyCount })
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown-sync-error'
    update({ status: 'error', userId, email, lastSyncAt, error: message })
    return false
  }
}


async function rememberedCursor(): Promise<number> {
  const row = await db.settings.get(CURSOR_KEY)
  return row && typeof row.value === 'number' ? row.value : 0
}

async function applyPulledEntries(
  localEntries: readonly Entry[],
  pulled: readonly SyncItem[],
  dek: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const localById = new Map(localEntries.map((entry) => [entry.id, entry]))
  const decrypted: Entry[] = []
  let skipped = 0
  for (const item of pulled) {
    try {
      decrypted.push(await openEntry(dek, item.cipher))
    } catch {
      skipped += 1
    }
  }
  const winning = selectWinningEntries(localById, decrypted)
  if (skipped > 0 && typeof window !== 'undefined') {
    window.console.warn(`skipped ${skipped} cloud entries encrypted with another key`)
  }
  for (const entry of winning) {
    await db.entries.put(entry)
  }
}

export function getState(): AccountState {
  return state
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useAccountState(): AccountState {
  return useSyncExternalStore(subscribe, getState, getState)
}

export const syncEngine = {
  getState,
  subscribe,
  start,
  beginEmailSignIn,
  verifyEmailOtp,
  signInWithPasskey,
  registerPasskey,
  signOut,
  syncNow,
}

onChange(() => {
  emit()
})
