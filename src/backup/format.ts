import { z } from 'zod'
import type { Entry } from '../db/types'

export const BACKUP_VERSION = 1

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const entrySchema = z.object({
  id: z.string().min(1),
  type: z.enum(['note', 'task', 'checklist', 'journal']),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  pinned: z.union([z.literal(0), z.literal(1)]),
  done: z.boolean().optional(),
  due: isoDate.optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  items: z
    .array(z.object({ id: z.string(), text: z.string(), done: z.boolean() }))
    .optional(),
  date: isoDate.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number(),
})

export const backupSchema = z.object({
  app: z.literal('journa'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  entries: z.array(entrySchema),
})

export type Backup = z.infer<typeof backupSchema>

/** Encrypted wrapper. The plaintext inside is a serialized Backup. */
export const encryptedSchema = z.object({
  app: z.literal('journa'),
  encrypted: z.literal(true),
  version: z.literal(BACKUP_VERSION),
  kdf: z.object({ name: z.literal('PBKDF2'), hash: z.literal('SHA-256'), iterations: z.number(), salt: z.string() }),
  cipher: z.object({ name: z.literal('AES-GCM'), iv: z.string() }),
  data: z.string(),
})

export type EncryptedBackup = z.infer<typeof encryptedSchema>

export function makeBackup(entries: Entry[], now = Date.now()): Backup {
  return { app: 'journa', version: BACKUP_VERSION, exportedAt: now, entries }
}

export class BackupFormatError extends Error {}

export type ParsedFile =
  | { kind: 'plain'; backup: Backup }
  | { kind: 'encrypted'; file: EncryptedBackup }

export function parseBackupText(text: string): ParsedFile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupFormatError('not-json')
  }
  const enc = encryptedSchema.safeParse(json)
  if (enc.success) return { kind: 'encrypted', file: enc.data }
  const plain = backupSchema.safeParse(json)
  if (plain.success) return { kind: 'plain', backup: plain.data as Backup }
  throw new BackupFormatError('not-journa')
}
