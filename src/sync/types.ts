import { z } from 'zod'
import { entrySchema } from '../backup/format'

/** Cognito `sub`, branded so user ids never mix with other string ids. */
export type UserId = string & { readonly __brand: 'UserId' }

export type SyncCursor = number & { readonly __brand: 'SyncCursor' }

export const sealedEntrySchema = z.object({
  id: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative(),
  ivB64: z.string().min(1),
  dataB64: z.string().min(1),
})

export type SealedEntry = z.infer<typeof sealedEntrySchema>

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
    cipher: sealedEntrySchema,
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