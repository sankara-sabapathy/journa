import Dexie, { type Table } from 'dexie'
import type { Entry, Setting, OutboxEntry } from './types'

export class JournaDB extends Dexie {
  entries!: Table<Entry, string>
  settings!: Table<Setting, string>
  outbox!: Table<OutboxEntry, string>

  constructor(name = 'journa') {
    super(name)
    this.version(1).stores({
      entries: 'id, type, updatedAt, date, *tags, pinned, deletedAt, [type+deletedAt]',
      settings: 'key',
    })
    this.version(2).stores({
      entries: 'id, type, updatedAt, date, *tags, pinned, deletedAt, [type+deletedAt]',
      settings: 'key',
      outbox: 'id, updatedAt',
    })
  }
}

export const db = new JournaDB()