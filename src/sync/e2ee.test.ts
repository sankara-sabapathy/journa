import { describe, expect, it } from 'vitest'
import { decryptText, encryptText } from '../backup/crypto'
import type { Entry } from '../db/types'
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
    const cipher = await encryptText(JSON.stringify(entry), 'correct horse')
    const parsed = syncItemSchema.parse({
      kind: 'encrypted',
      id: entry.id,
      updatedAt: entry.updatedAt,
      deletedAt: entry.deletedAt,
      cipher,
    })
    expect(parsed.kind).toBe('encrypted')
    if (parsed.kind !== 'encrypted') throw new Error('expected encrypted envelope')
    expect(JSON.stringify(parsed.cipher)).not.toContain('hello')
    expect(JSON.parse(await decryptText(parsed.cipher, 'correct horse'))).toEqual(entry)
  })
})
