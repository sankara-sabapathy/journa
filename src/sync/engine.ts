import { useSyncExternalStore } from 'react'
import { AppError, toErrorCode } from '../app/errors'
import { db } from '../db/db'
import { newId, onChange } from '../db/repo'
import type { Entry } from '../db/types'
import { openEntry, sealEntry } from './deviceKeys'
import { resolveDataKey } from './devices'
import { detectSyncConflicts, selectWinningEntries } from './merge'
import { syncRequestSchema, syncResponseSchema, type AccountState, type SyncConflict, type SyncItem, type UserId } from './types'
import * as auth from './auth'

const TOKENS_KEY = 'auth.tokens'
const ACCOUNT_KEY = 'auth.account'
const CURSOR_KEY = 'sync.cursor'

type StoredCredentials = auth.CloudCredentials

let state: AccountState = { status: 'signed-out' }
/** Kept in memory only, for the one step between confirming and signing in. */
let pendingPassword: string | null = null
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

export async function createAccount(email: string, password: string) {
  const result = await auth.signUp(email, password)
  pendingPassword = password
  if (result.confirmed) {
    // Cognito confirmed straight away, so only the sign-in code is left.
    const session = await auth.beginEmailSignIn(email)
    update({ status: 'awaiting-code', email, session, purpose: 'sign-in' })
    return
  }
  update({ status: 'awaiting-code', email, session: result.session, purpose: 'confirm' })
}

export async function beginEmailSignIn(email: string) {
  const session = await auth.beginEmailSignIn(email)
  update({ status: 'awaiting-code', email, session, purpose: 'sign-in' })
}

/** Sends the code again, whichever kind the user is waiting on. */
export async function resendCode() {
  if (state.status !== 'awaiting-code') throw new AppError('error.unknown')
  const { email, purpose } = state
  if (purpose === 'confirm') {
    await auth.resendConfirmationCode(email)
    return
  }
  const session = await auth.beginEmailSignIn(email)
  update({ status: 'awaiting-code', email, session, purpose: 'sign-in' })
}

/** Answers the code the user typed in. */
export async function verifyCode(code: string) {
  if (state.status !== 'awaiting-code') throw new AppError('error.unknown')
  const { email, session, purpose } = state

  if (purpose === 'confirm') {
    await auth.confirmSignUp(email, code)
    // The address is verified. Sign in with the password we already have so
    // the new account needs only this one code; fall back to an emailed code.
    const password = pendingPassword
    const credentials = password ? await auth.signInWithPassword(email, password) : null
    if (!credentials) {
      const next = await auth.beginEmailSignIn(email)
      update({ status: 'awaiting-code', email, session: next, purpose: 'sign-in' })
      return
    }
    await finishSignIn(credentials)
    return
  }

  const outcome = await auth.respondToChallenge('EMAIL_OTP', session, { USERNAME: email, ANSWER: code })
  if (outcome.kind === 'challenge') {
    update({ status: 'awaiting-code', email, session: outcome.session, purpose: 'sign-in' })
    return
  }
  await finishSignIn(outcome.credentials)
}

/** Drops the pending sign-in and returns to the signed-out screen. */
export function cancelAuth() {
  pendingPassword = null
  if (state.status !== 'awaiting-code') return
  update({ status: 'signed-out' })
}

async function finishSignIn(credentials: auth.CloudCredentials) {
  pendingPassword = null
  await putSettings(TOKENS_KEY, credentials)
  await putSettings(ACCOUNT_KEY, { lastSyncAt: null })
  update(credentialsAccount(credentials, null))
}

export async function signOut() {
  pendingPassword = null
  if (state.status === 'signed-out' || state.status === 'awaiting-code') return
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
      update({ status: 'error', userId, email, lastSyncAt, error: 'error.deviceNotEnrolled' })
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
    update({ status: 'error', userId, email, lastSyncAt, error: toErrorCode(error) })
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
  const conflicts = detectSyncConflicts(localById, decrypted)
  stashConflicts(conflicts)
  const conflictedIds = new Set(conflicts.map((c) => c.id))
  const auto = decrypted.filter((e) => !conflictedIds.has(e.id))
  const winning = selectWinningEntries(localById, auto)
  if (skipped > 0 && typeof window !== 'undefined') {
    window.console.warn(`skipped ${skipped} cloud entries encrypted with another key`)
  }
  for (const entry of winning) {
    await db.entries.put(entry)
  }
}

let pendingConflicts: SyncConflict[] = []
const conflictListeners = new Set<() => void>()

function emitConflicts() {
  for (const listener of conflictListeners) listener()
}

function stashConflicts(found: readonly SyncConflict[]): void {
  if (found.length === 0) return
  const ids = new Set(found.map((c) => c.id))
  pendingConflicts = [...pendingConflicts.filter((c) => !ids.has(c.id)), ...found]
  emitConflicts()
}

function dropConflict(id: string): void {
  if (!pendingConflicts.some((c) => c.id === id)) return
  pendingConflicts = pendingConflicts.filter((c) => c.id !== id)
  emitConflicts()
}

export function getConflicts(): SyncConflict[] {
  return pendingConflicts
}

export function subscribeConflicts(fn: () => void): () => void {
  conflictListeners.add(fn)
  return () => conflictListeners.delete(fn)
}

export function useConflicts(): SyncConflict[] {
  return useSyncExternalStore(subscribeConflicts, getConflicts, getConflicts)
}

/** Keep the server version; the local edit is discarded. */
export async function resolveConflictKeepIncoming(id: string): Promise<void> {
  const conflict = pendingConflicts.find((c) => c.id === id)
  if (!conflict) return
  await db.entries.put(conflict.incoming)
  dropConflict(id)
}

/** Keep this device's version and push it back so it wins everywhere. */
export async function resolveConflictKeepLocal(id: string): Promise<void> {
  const conflict = pendingConflicts.find((c) => c.id === id)
  if (!conflict?.local) return
  const updatedAt = Date.now()
  await db.entries.update(id, { updatedAt })
  await db.outbox.put({ id, updatedAt })
  dropConflict(id)
}

/** Keep both: incoming stays, and the local version is saved as a conflict copy. */
export async function resolveConflictKeepBoth(id: string): Promise<void> {
  const conflict = pendingConflicts.find((c) => c.id === id)
  if (!conflict?.local) return
  const now = Date.now()
  await db.entries.put(conflict.incoming)
  const copy: Entry = {
    ...conflict.local,
    id: newId(),
    title: conflict.local.title ? `${conflict.local.title} (conflict)` : 'Conflict copy',
    tags: [...conflict.local.tags, 'conflict'],
    createdAt: now,
    updatedAt: now,
    deletedAt: 0,
  }
  await db.entries.add(copy)
  await db.outbox.put({ id: copy.id, updatedAt: now })
  dropConflict(id)
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
  signOut,
  createAccount,
  beginEmailSignIn,
  verifyCode,
  resendCode,
  cancelAuth,
  syncNow,
  getConflicts,
  subscribeConflicts,
  resolveConflictKeepIncoming,
  resolveConflictKeepLocal,
  resolveConflictKeepBoth,
}

onChange(() => {
  emit()
})
