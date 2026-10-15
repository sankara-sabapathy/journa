import { describe, expect, it } from 'vitest'
import type { Entry } from '../db/types'
import {
  generateDeviceKeypair,
  openEntry,
  randomDataKey,
  sealEntry,
  unwrapDataKey,
  wrapDataKey,
} from './deviceKeys'

const entry: Entry = {
  id: 'note-1',
  type: 'note',
  title: 'hello',
  body: 'secret body',
  tags: [],
  pinned: 0,
  createdAt: 10,
  updatedAt: 20,
  deletedAt: 0,
}

describe('deviceKeys', () => {
  it('round-trips a data key between two devices', async () => {
    const a = await generateDeviceKeypair()
    const b = await generateDeviceKeypair()
    expect(a.deviceId).toHaveLength(22)
    expect(b.deviceId).toHaveLength(22)
    expect(a.deviceId).not.toBe(b.deviceId)

    const dek = await randomDataKey()
    expect(dek).toHaveLength(32)

    const wrap = await wrapDataKey(dek, b.publicJwk)
    expect(wrap.recipientId).toBe(b.deviceId)

    const out = await unwrapDataKey(wrap, b.privateKey)
    expect(out).toEqual(dek)

    await expect(unwrapDataKey(wrap, a.privateKey)).rejects.toThrow()
  })

  it('round-trips a sealed entry', async () => {
    const dek = await randomDataKey()
    const sealed = await sealEntry(dek, entry)
    expect(JSON.stringify(sealed)).not.toContain('secret body')
    expect(sealed.id).toBe(entry.id)
    expect(await openEntry(dek, sealed)).toEqual(entry)
  })

  it('rejects tampered envelope metadata', async () => {
    const dek = await randomDataKey()
    const sealed = await sealEntry(dek, entry)
    await expect(openEntry(dek, { ...sealed, id: 'note-evil' })).rejects.toThrow()
    await expect(openEntry(dek, { ...sealed, updatedAt: sealed.updatedAt + 1 })).rejects.toThrow()
    await expect(openEntry(dek, { ...sealed, deletedAt: 123 })).rejects.toThrow()
  })
})
