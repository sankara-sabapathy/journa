import { describe, expect, it } from 'vitest'
import type { Entry } from '../db/types'
import { openEntry, randomDataKey, sealEntry } from './deviceKeys'
import { syncItemSchema } from './types'

const entry: Entry = {
  id: 'journal-2026-10-15',
  type: 'journal',
  title: '',
  body: 'hello',
  tags: [],
  pinned: 0,
  date: '2026-10-15',
  createdAt: 10,
  updatedAt: 20,
  deletedAt: 0,
}

describe('sync E2EE envelope', () => {
  it('round-trips an entry through ciphertext the server cannot read', async () => {
    const dek = await randomDataKey()
    const sealed = await sealEntry(dek, entry)
    const parsed = syncItemSchema.parse({
      kind: 'encrypted',
      id: entry.id,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
      cipher: sealed,
    })
    expect(parsed.kind).toBe('encrypted')
    if (parsed.kind !== 'encrypted') throw new Error('expected encrypted envelope')
    expect(JSON.stringify(parsed.cipher)).not.toContain('hello')
    expect(await openEntry(dek, parsed.cipher)).toEqual(entry)
  })
})
