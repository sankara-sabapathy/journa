export type EntryType = 'note' | 'task' | 'checklist' | 'journal'
export type Mood = 1 | 2 | 3 | 4 | 5
export type Priority = 1 | 2 | 3

export const ENTRY_TYPES: readonly EntryType[] = ['journal', 'note', 'task', 'checklist']

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Entry {
  id: string
  type: EntryType
  title: string
  /** Markdown body. */
  body: string
  tags: string[]
  /** Stored as 0/1 so it can be indexed (IndexedDB cannot index booleans). */
  pinned: 0 | 1
  // task
  done?: boolean
  /** YYYY-MM-DD */
  due?: string
  priority?: Priority
  // checklist
  items?: ChecklistItem[]
  // journal
  date?: string
  mood?: Mood
  createdAt: number
  updatedAt: number
  /** Set when moved to Trash. 0 means not deleted (indexable). */
  deletedAt: number
}

export interface Setting<T = unknown> {
  key: string
  value: T
}

export interface OutboxEntry {
  /** Entry id that changed locally and still needs to be pushed to cloud sync. */
  id: string
  /** Local `updatedAt` (or `deletedAt` for a trashed entry) used for LWW ordering. */
  updatedAt: number
}
