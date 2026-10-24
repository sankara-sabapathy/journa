import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { JournaDB } from '../db/db'
import { createSetsStore, DEFAULT_SET_ID, parseQuestions, type QuestionSet } from './sets'

let n = 0
function fresh() {
  const database = new JournaDB(`sets-${n++}`)
  return { database, store: createSetsStore(database) }
}

describe('parseQuestions', () => {
  it('takes one question per line, trimming and dropping blanks', () => {
    expect(parseQuestions('  Who helped me?  \n\n\n What did I build?\n  ')).toEqual([
      'Who helped me?',
      'What did I build?',
    ])
  })

  it('drops repeats, whatever their case', () => {
    expect(parseQuestions('What helped?\nwhat helped?')).toEqual(['What helped?'])
  })

  it('handles Windows line endings', () => {
    expect(parseQuestions('One\r\nTwo')).toEqual(['One', 'Two'])
  })
})

describe('sets store', () => {
  let ctx: ReturnType<typeof fresh>
  beforeEach(() => {
    ctx = fresh()
  })

  it('starts on Journa’s own questions', async () => {
    expect(await ctx.store.list()).toEqual([])
    expect(await ctx.store.activeId()).toBe(DEFAULT_SET_ID)
    expect(await ctx.store.active()).toBeNull()
  })

  it('saves a set and makes it active', async () => {
    const set = await ctx.store.save({ name: '  Evening review ', questions: ['Who helped me?', ''] })
    expect(set.name).toBe('Evening review')
    expect(set.questions).toEqual(['Who helped me?'])
    await ctx.store.setActive(set.id)

    expect(await ctx.store.active()).toMatchObject({ id: set.id, name: 'Evening review' })
    expect((await ctx.store.list()).map((s) => s.name)).toEqual(['Evening review'])
  })

  it('edits a set in place', async () => {
    const set = await ctx.store.save({ name: 'A', questions: ['One'] })
    await ctx.store.save({ id: set.id, name: 'B', questions: ['One', 'Two'] })
    const all = await ctx.store.list()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id: set.id, name: 'B', questions: ['One', 'Two'] })
  })

  it('lists sets by name', async () => {
    await ctx.store.save({ name: 'Zebra', questions: ['Q'] })
    await ctx.store.save({ name: 'Apple', questions: ['Q'] })
    expect((await ctx.store.list()).map((s) => s.name)).toEqual(['Apple', 'Zebra'])
  })

  it('falls back to Journa’s questions when the active set is deleted', async () => {
    const set = await ctx.store.save({ name: 'Gone', questions: ['Q'] })
    await ctx.store.setActive(set.id)
    await ctx.store.remove(set.id)
    expect(await ctx.store.activeId()).toBe(DEFAULT_SET_ID)
    expect(await ctx.store.active()).toBeNull()
  })

  it('ignores an active id that no longer exists', async () => {
    await ctx.store.setActive('missing')
    expect(await ctx.store.activeId()).toBe(DEFAULT_SET_ID)
  })

  it('merges by id, keeping the newer copy', async () => {
    const set = await ctx.store.save({ name: 'Local', questions: ['One'] })
    const incoming: QuestionSet = { ...set, name: 'Older incoming', updatedAt: set.updatedAt - 1000 }
    const newer: QuestionSet = { id: 'other', name: 'Brand new', questions: ['Two'], updatedAt: set.updatedAt + 1 }

    await ctx.store.merge([incoming, newer], 'other')

    const all = await ctx.store.list()
    expect(all.map((s) => s.name)).toEqual(['Brand new', 'Local'])
    expect(await ctx.store.active()).toMatchObject({ id: 'other' })
  })

  it('replaces every set on a replace import', async () => {
    await ctx.store.save({ name: 'Local', questions: ['One'] })
    const incoming: QuestionSet = { id: 'x', name: 'Incoming', questions: ['Two'], updatedAt: 1 }
    await ctx.store.replaceAll([incoming], 'x')
    expect((await ctx.store.list()).map((s) => s.name)).toEqual(['Incoming'])
    expect(await ctx.store.activeId()).toBe('x')
  })

  it('skips junk entries in an imported list', async () => {
    await ctx.store.merge([{ id: 'bad' } as unknown as QuestionSet, { id: 'ok', name: 'Ok', questions: ['Q'], updatedAt: 1 }])
    expect((await ctx.store.list()).map((s) => s.id)).toEqual(['ok'])
  })
})
