import { db, type JournaDB } from './db'
import { toISODate } from './date'
import type { ChecklistItem, Entry, EntryType, Mood } from './types'

export type NewEntry = Partial<Omit<Entry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>> & {
  type: EntryType
}

const listeners = new Set<() => void>()

export function onChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function changed() {
  for (const fn of listeners) fn()
}

export function newId(): string {
  return crypto.randomUUID()
}

export function makeEntry(input: NewEntry, now = Date.now()): Entry {
  const date = input.type === 'journal' && !input.date
    ? toISODate(new Date(now))
    : input.date
  const entry: Entry = {
    id: input.type === 'journal' && date
      ? `journal-${date}`
      : newId(),
    title: '',
    body: '',
    tags: [],
    pinned: 0,
    ...input,
    type: input.type,
    date,
    createdAt: now,
    updatedAt: now,
    deletedAt: 0,
  }
  if (entry.type === 'task' && entry.done === undefined) entry.done = false
  if (entry.type === 'checklist' && !entry.items) entry.items = []
  return entry
}

export function createRepo(database: JournaDB = db) {
  async function touchOutbox(id: string, updatedAt: number): Promise<void> {
    await database.outbox.put({ id, updatedAt })
  }

  return {
    async create(input: NewEntry): Promise<Entry> {
      const entry = makeEntry(input)
      await database.entries.add(entry)
      await touchOutbox(entry.id, entry.updatedAt)
      changed()
      return entry
    },

    async get(id: string): Promise<Entry | undefined> {
      return database.entries.get(id)
    },

    async update(id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>): Promise<void> {
      const updatedAt = Date.now()
      await database.entries.update(id, { ...patch, updatedAt })
      await touchOutbox(id, updatedAt)
      changed()
    },

    async trash(id: string): Promise<void> {
      const updatedAt = Date.now()
      await database.entries.update(id, { deletedAt: updatedAt, updatedAt })
      await touchOutbox(id, updatedAt)
      changed()
    },

    async restore(id: string): Promise<void> {
      const updatedAt = Date.now()
      await database.entries.update(id, { deletedAt: 0, updatedAt })
      await touchOutbox(id, updatedAt)
      changed()
    },

    async emptyTrash(): Promise<number> {
      const n = await database.entries.where('deletedAt').above(0).delete()
      changed()
      return n
    },

    async list(type?: EntryType): Promise<Entry[]> {
      const rows = type
        ? await database.entries.where('[type+deletedAt]').equals([type, 0]).toArray()
        : await database.entries.where('deletedAt').equals(0).toArray()
      return sortEntries(rows)
    },

    async listTrash(): Promise<Entry[]> {
      const rows = await database.entries.where('deletedAt').above(0).toArray()
      return rows.sort((a, b) => b.deletedAt - a.deletedAt)
    },

    async journalFor(date: string): Promise<Entry | undefined> {
      return database.entries
        .where('date')
        .equals(date)
        .filter((e) => e.type === 'journal' && e.deletedAt === 0)
        .first()
    },

    async ensureJournal(date = toISODate()): Promise<Entry> {
      return database.transaction('rw', database.entries, database.outbox, async () => {
        const existing = await this.journalFor(date)
        if (existing) return existing
        const entry = makeEntry({ type: 'journal', date })
        await database.entries.add(entry)
        await touchOutbox(entry.id, entry.updatedAt)
        changed()
        return entry
      })
    },

    /**
     * Saves a day's journal text and mood. Creates the entry only when there is something to keep;
     * a null mood clears the face. Returns whether anything was written.
     */
    async saveJournal(date: string, body: string, mood: Mood | null): Promise<boolean> {
      const existing = await this.journalFor(date)
      if (!existing && !body.trim() && mood === null) return false
      const entry = existing ?? (await this.ensureJournal(date))
      // `mood: undefined` removes the field.
      await this.update(entry.id, { body, mood: mood ?? undefined })
      return true
    },

    /** Days the user showed up: journal text, a mood check-in, or both. */
    async writtenDays(from: string, to: string): Promise<Set<string>> {
      const rows = await database.entries.where('date').between(from, to, true, true).toArray()
      return new Set(
        rows
          .filter((e) => e.type === 'journal' && e.deletedAt === 0 && (e.body.trim() !== '' || e.mood !== undefined))
          .map((e) => e.date!),
      )
    },

    async search(query: string): Promise<Entry[]> {
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
      if (terms.length === 0) return []
      const rows = await database.entries.where('deletedAt').equals(0).toArray()
      return sortEntries(rows.filter((e) => terms.every((t) => searchText(e).includes(t))))
    },

    async allTags(): Promise<string[]> {
      const keys = await database.entries.orderBy('tags').uniqueKeys()
      return keys.map(String).sort((a, b) => a.localeCompare(b))
    },

    async discardIfEmpty(id: string): Promise<boolean> {
      const e = await database.entries.get(id)
      if (!e || e.type === 'journal') return false
      if (e.title.trim() || e.body.trim() || e.tags.length || e.items?.length || e.due) return false
      await database.entries.delete(id)
      changed()
      return true
    },

    async toggleTask(id: string): Promise<void> {
      const e = await database.entries.get(id)
      if (!e) return
      await this.update(id, { done: !e.done })
    },

    async setItems(id: string, items: ChecklistItem[]): Promise<void> {
      await this.update(id, { items })
    },
  }
}

export type Repo = ReturnType<typeof createRepo>

export const repo = createRepo()

function searchText(e: Entry): string {
  const items = e.items?.map((i) => i.text).join(' ') ?? ''
  return `${e.title} ${e.body} ${e.tags.join(' ')} ${items}`.toLocaleLowerCase()
}

export function sortEntries(rows: Entry[]): Entry[] {
  return rows.sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt)
}