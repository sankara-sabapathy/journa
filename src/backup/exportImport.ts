import { strToU8, zipSync } from 'fflate'
import { db as defaultDb, type JournaDB } from '../db/db'
import type { Entry, Mood } from '../db/types'
import { decryptText, encryptText } from './crypto'
import { backupSchema, BackupFormatError, makeBackup, parseBackupText, type Backup } from './format'

/** Mood words for Markdown front matter; the file format is not localised. */
const MOOD_WORDS: Record<Mood, string> = { 1: 'rough', 2: 'low', 3: 'okay', 4: 'good', 5: 'great' }

export async function exportBackup(database: JournaDB = defaultDb): Promise<Backup> {
  return makeBackup(await database.entries.toArray())
}

/** Serialized backup file contents, optionally encrypted with a passphrase. */
export async function backupFileText(passphrase?: string, database: JournaDB = defaultDb): Promise<string> {
  const json = JSON.stringify(await exportBackup(database))
  if (!passphrase) return json
  return JSON.stringify(await encryptText(json, passphrase))
}

/** Reads a backup file's text; asks for a passphrase only when the file is encrypted. */
export async function readBackupFile(
  text: string,
  askPassphrase: () => Promise<string | null>,
): Promise<Backup | null> {
  const parsed = parseBackupText(text)
  if (parsed.kind === 'plain') return parsed.backup
  const pass = await askPassphrase()
  if (pass === null) return null
  const inner = backupSchema.safeParse(JSON.parse(await decryptText(parsed.file, pass)))
  if (!inner.success) throw new BackupFormatError('not-journa')
  return inner.data as Backup
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  added: number
  updated: number
  skipped: number
}

/**
 * merge: entries are matched by id and the newer updatedAt wins.
 * replace: all local entries are removed first.
 */
export async function importBackup(
  backup: Backup,
  mode: ImportMode,
  database: JournaDB = defaultDb,
): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }
  await database.transaction('rw', database.entries, async () => {
    if (mode === 'replace') {
      await database.entries.clear()
      await database.entries.bulkAdd(backup.entries)
      result.added = backup.entries.length
      return
    }
    const existing = await database.entries.bulkGet(backup.entries.map((e) => e.id))
    const toPut: Entry[] = []
    backup.entries.forEach((incoming, i) => {
      const local = existing[i]
      if (!local) {
        result.added++
        toPut.push(incoming)
      } else if (incoming.updatedAt > local.updatedAt) {
        result.updated++
        toPut.push(incoming)
      } else {
        result.skipped++
      }
    })
    await database.entries.bulkPut(toPut)
  })
  return result
}

function slug(s: string): string {
  return (
    s
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'untitled'
  )
}

function yamlString(s: string): string {
  return JSON.stringify(s)
}

export function entryToMarkdown(e: Entry): string {
  const fm = [
    '---',
    `id: ${e.id}`,
    `type: ${e.type}`,
    `title: ${yamlString(e.title)}`,
    e.date ? `date: ${e.date}` : null,
    e.tags.length ? `tags: [${e.tags.map(yamlString).join(', ')}]` : null,
    e.type === 'task' ? `done: ${Boolean(e.done)}` : null,
    e.due ? `due: ${e.due}` : null,
    e.priority ? `priority: ${e.priority}` : null,
    e.mood ? `mood: ${MOOD_WORDS[e.mood]}` : null,
    e.pinned ? 'pinned: true' : null,
    `created: ${new Date(e.createdAt).toISOString()}`,
    `updated: ${new Date(e.updatedAt).toISOString()}`,
    '---',
  ].filter((l) => l !== null)
  const parts = [fm.join('\n'), '']
  if (e.title) parts.push(`# ${e.title}`, '')
  if (e.items?.length) {
    parts.push(e.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n'), '')
  }
  if (e.body) parts.push(e.body, '')
  return parts.join('\n')
}

/** Zip of one Markdown file per live entry, grouped by type. */
export async function exportMarkdownZip(database: JournaDB = defaultDb): Promise<Uint8Array> {
  const entries = await database.entries.where('deletedAt').equals(0).toArray()
  const files: Record<string, Uint8Array> = {}
  for (const e of entries) {
    const base = e.type === 'journal' && e.date ? e.date : slug(e.title)
    const name = `${e.type}/${base}-${e.id.slice(0, 8)}.md`
    files[name] = strToU8(entryToMarkdown(e))
  }
  return zipSync(files, { level: 6 })
}

export function backupFileName(now = new Date(), ext = 'json'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `journa-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.${ext}`
}
