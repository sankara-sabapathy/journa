import { z } from 'zod'
import { encryptedSchema, entrySchema } from '../backup/format'

/** A Journa user id, always `sub` from Cognito in `UserId#...` form. */
export type UserId = string & { readonly __brand: 'UserId' }

/** Monotonic per-user server cursor returned by `POST /v1/sync`. */
export type SyncCursor = number & { readonly __brand: 'SyncCursor' }

/**
 * One synced record. Plaintext entries carry a full `Entry`; encrypted entries
 * carry the AES-GCM payload produced by `encryptText` in `src/backup/crypto.ts`
 * so the server only ever sees ciphertext. `id`, `updatedAt` and `deletedAt`
 * always remain in the clear for LWW ordering.
 */
export const syncItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('plain'),
    id: z.string().min(1),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative(),
    entry: entrySchema,
  }),
  z.object({
    kind: z.literal('encrypted'),
    id: z.string().min(1),
    updatedAt: z.number().int().nonnegative(),
    deletedAt: z.number().int().nonnegative(),
    cipher: encryptedSchema,
  }),
])

export type SyncItem = z.infer<typeof syncItemSchema>

export const syncRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  push: z.array(syncItemSchema).max(100),
})

export const syncResponseSchema = z.object({
  cursor: z.number().int().nonnegative(),
  pull: z.array(syncItemSchema),
  applied: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

export type SyncRequest = z.infer<typeof syncRequestSchema>
export type SyncResponse = z.infer<typeof syncResponseSchema>

/** Tracks whether we are offering old or new data for a conflicting entry. */
export type SyncConflictReason = 'concurrent-edit' | 'edit-after-delete' | 'same-update'

export interface SyncConflict {
  readonly id: string
  readonly reason: SyncConflictReason
  readonly local: SyncItem | null
  readonly incoming: SyncItem
}

export type AccountState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'awaiting-otp'; readonly email: string; readonly session: string }
  | {
      readonly status: 'idle'
      readonly userId: UserId
      readonly email: string
      readonly lastSyncAt: number | null
      readonly dirtyCount: number
    }
  | {
      readonly status: 'syncing'
      readonly userId: UserId
      readonly email: string
      readonly lastSyncAt: number | null
    }
  | {
      readonly status: 'error'
      readonly userId: UserId
      readonly email: string
      readonly lastSyncAt: number | null
      readonly error: string
    }