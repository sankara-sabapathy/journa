import 'fake-indexeddb/auto'
import { unzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { JournaDB } from '../db/db'
import { createRepo, makeEntry } from '../db/repo'
import { decryptText, encryptText, WrongPassphraseError } from './crypto'
import {
  backupFileName,
  backupFileText,
  entryToMarkdown,
  exportBackup,
  exportMarkdownZip,
  importBackup,
  readBackupFile,
} from './exportImport'
import { BackupFormatError, makeBackup, parseBackupText } from './format'
import { filesToDelete } from './targets/folderTarget'
import { createSetsStore } from '../journal/sets'

let n = 0
const fresh = () => {
  const database = new JournaDB(`backup-${n++}`)
  return { database, repo: createRepo(database) }
}

describe('export / import', () => {
  it('round-trips every entry losslessly', async () => {
    const a = fresh()
    await a.repo.create({ type: 'note', title: 'n', body: '**hi**', tags: ['x'] })
    await a.repo.create({ type: 'checklist', title: 'c', items: [{ id: 'i', text: 'milk', done: true }] })
    const j = await a.repo.ensureJournal('2026-10-12')
    await a.repo.trash(j.id)
    const text = await backupFileText(undefined, a.database)

    const b = fresh()
    const backup = await readBackupFile(text, async () => null)
    await importBackup(backup!, 'replace', b.database)
    expect(await exportBackup(b.database).then((x) => x.entries)).toEqual(
      await exportBackup(a.database).then((x) => x.entries),
    )
  })

  it('merge keeps the newer copy of each entry and adds missing ones', async () => {
    const { database, repo } = fresh()
    const local = await repo.create({ type: 'note', title: 'local newer' })
    const older = makeEntry({ type: 'note', title: 'incoming older' }, local.updatedAt - 1000)
    older.id = local.id
    const newer = makeEntry({ type: 'note', title: 'incoming new' })
    const res = await importBackup(makeBackup([older, newer]), 'merge', database)
    expect(res).toEqual({ added: 1, updated: 0, skipped: 1 })
    expect((await repo.get(local.id))!.title).toBe('local newer')

    const newest = { ...older, title: 'incoming newest', updatedAt: Date.now() + 1000 }
    const res2 = await importBackup(makeBackup([newest]), 'merge', database)
    expect(res2.updated).toBe(1)
    expect((await repo.get(local.id))!.title).toBe('incoming newest')
  })

  it('rejects files that are not Journa backups', () => {
    expect(() => parseBackupText('nope')).toThrow(BackupFormatError)
    expect(() => parseBackupText('{"app":"other"}')).toThrow(BackupFormatError)
    expect(() =>
      parseBackupText(JSON.stringify({ app: 'journa', version: 1, exportedAt: 1, entries: [{ id: 'x' }] })),
    ).toThrow(BackupFormatError)
  })

  it('encrypts and decrypts with a passphrase', async () => {
    const a = fresh()
    await a.repo.create({ type: 'note', title: 'secret' })
    const text = await backupFileText('correct horse', a.database)
    expect(text).not.toContain('secret')
    const backup = await readBackupFile(text, async () => 'correct horse')
    expect(backup!.entries[0].title).toBe('secret')
    await expect(readBackupFile(text, async () => 'wrong')).rejects.toBeInstanceOf(WrongPassphraseError)
    expect(await readBackupFile(text, async () => null)).toBeNull()
  })

  it('encryption uses a fresh salt and iv each time', async () => {
    const x = await encryptText('same', 'p')
    const y = await encryptText('same', 'p')
    expect(x.data).not.toBe(y.data)
    expect(await decryptText(y, 'p')).toBe('same')
  })

  it('exports one Markdown file per live entry', async () => {
    const { database, repo } = fresh()
    await repo.create({ type: 'task', title: 'Pay bill', due: '2026-10-12', tags: ['home'] })
    const j = await repo.ensureJournal('2026-10-12')
    await repo.update(j.id, { body: 'Rain all morning.' })
    const gone = await repo.create({ type: 'note', title: 'gone' })
    await repo.trash(gone.id)
    const files = unzipSync(await exportMarkdownZip(database))
    const names = Object.keys(files).sort()
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^journal\/2026-10-12-/)
    expect(names[1]).toMatch(/^task\/pay-bill-/)
    expect(strFromU8(files[names[0]])).toContain('Rain all morning.')
  })

  it('writes checklist items as Markdown task lists', () => {
    const md = entryToMarkdown(
      makeEntry({ type: 'checklist', title: 'Shop', items: [{ id: '1', text: 'milk', done: true }, { id: '2', text: 'eggs', done: false }] }),
    )
    expect(md).toContain('- [x] milk\n- [ ] eggs')
    expect(md).toContain('title: "Shop"')
  })

  it('carries the user’s own question sets and keeps them when a file has none', async () => {
    const a = fresh()
    const sets = createSetsStore(a.database)
    const set = await sets.save({ name: 'Evening review', questions: ['Who helped me?', 'What tired me?'] })
    await sets.setActive(set.id)

    const text = await backupFileText(undefined, a.database)
    const b = fresh()
    await importBackup((await readBackupFile(text, async () => null))!, 'merge', b.database)
    const restored = createSetsStore(b.database)
    expect((await restored.list()).map((s) => s.name)).toEqual(['Evening review'])
    expect(await restored.activeId()).toBe(set.id)

    // An old backup (no question sets) must not throw the local sets away.
    await importBackup(makeBackup([]), 'replace', b.database)
    expect((await restored.list()).map((s) => s.name)).toEqual(['Evening review'])
  })

  it('keeps the mood through a backup round trip and in Markdown front matter', async () => {    const a = fresh()
    const j = await a.repo.ensureJournal('2026-10-12')
    await a.repo.update(j.id, { body: 'Rain.', mood: 2 })

    const text = await backupFileText(undefined, a.database)
    const b = fresh()
    const backup = await readBackupFile(text, async () => null)
    await importBackup(backup!, 'replace', b.database)
    expect((await b.repo.get(j.id))!.mood).toBe(2)

    expect(entryToMarkdown((await b.repo.get(j.id))!)).toContain('mood: low')
  })
})

describe('rotation', () => {
  it('keeps only the newest N backup files and ignores other files', () => {
    const names = [
      'journa-backup-20261010-090000.json',
      'journa-backup-20261012-090000.jbak',
      'journa-backup-20261011-090000.json',
      'my-notes.txt',
    ]
    expect(filesToDelete(names, 2)).toEqual(['journa-backup-20261010-090000.json'])
    expect(filesToDelete(names, 5)).toEqual([])
  })

  it('names files so they sort chronologically', () => {
    expect(backupFileName(new Date(2026, 9, 12, 9, 5, 7))).toBe('journa-backup-20261012-090507.json')
  })
})
