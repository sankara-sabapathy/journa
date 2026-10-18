import { describe, expect, it } from 'vitest'
import type { Entry } from '../db/types'
import { detectSyncConflicts, selectWinningEntries } from './merge'

function entry(partial: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    id: partial.id,
    type: partial.type ?? 'note',
    title: partial.title ?? '',
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    pinned: partial.pinned ?? 0,
    createdAt: partial.createdAt ?? 10,
    updatedAt: partial.updatedAt ?? 10,
    deletedAt: partial.deletedAt ?? 0,
  }
}

describe('selectWinningEntries', () => {
  it('accepts new entries missing locally', () => {
    const local = new Map<string, Entry>()
    const incoming = [entry({ id: 'a', title: 'hello', updatedAt: 20 })]
    expect(selectWinningEntries(local, incoming)).toEqual([incoming[0]])
  })

  it('keeps the local entry when it is newer', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', title: 'local', updatedAt: 30 })],
    ])
    const incoming = [entry({ id: 'a', title: 'remote', updatedAt: 20 })]
    expect(selectWinningEntries(local, incoming)).toEqual([])
  })

  it('takes the remote entry when it is newer', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', title: 'local', updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', title: 'remote', updatedAt: 30 })]
    expect(selectWinningEntries(local, incoming)).toEqual([incoming[0]])
  })

  it('breaks equal timestamps deterministically in favour of the larger title/body key', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', title: 'a', body: 'b', updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', title: 'z', body: '', updatedAt: 20 })]
    expect(selectWinningEntries(local, incoming).map((e) => e.title)).toEqual(['z'])
  })

  it('preserves trash propagation when remote deletedAt is newer', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', deletedAt: 0, updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', deletedAt: 30, updatedAt: 20 })]
    expect(selectWinningEntries(local, incoming).map((e) => e.deletedAt)).toEqual([30])
  })
})

describe('detectSyncConflicts', () => {
  it('flags concurrent edits to the same entry', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', body: 'good day', updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', body: 'terrible day', updatedAt: 30 })]
    const conflicts = detectSyncConflicts(local, incoming)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reason).toBe('concurrent-edit')
    expect(conflicts[0].local?.body).toBe('good day')
  })

  it('ignores entries that only one side changed', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', body: 'same', updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', body: 'same', updatedAt: 30 })]
    expect(detectSyncConflicts(local, incoming)).toEqual([])
  })

  it('flags an edit colliding with a delete', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', body: 'edited', updatedAt: 20 })],
    ])
    const incoming = [entry({ id: 'a', body: 'edited', deletedAt: 30, updatedAt: 30 })]
    const conflicts = detectSyncConflicts(local, incoming)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].reason).toBe('edit-after-delete')
  })

  it('ignores conflicts outside the time window', () => {
    const local = new Map<string, Entry>([
      ['a', entry({ id: 'a', body: 'old', updatedAt: 10 })],
    ])
    const incoming = [entry({ id: 'a', body: 'new', updatedAt: 10 + 600_000 })]
    expect(detectSyncConflicts(local, incoming)).toEqual([])
  })
})