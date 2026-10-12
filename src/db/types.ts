export type EntryType = 'note' | 'task' | 'checklist' | 'journal'

export const ENTRY_TYPES: readonly EntryType[] = ['journal', 'note', 'task', 'checklist']

export type Priority = 1 | 2 | 3

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
  // journal: one per day, YYYY-MM-DD
  date?: string
  createdAt: number
  updatedAt: number
  /** Set when moved to Trash. 0 means not deleted (indexable). */
  deletedAt: number
}

export interface Setting<T = unknown> {
  key: string
  value: T
}
