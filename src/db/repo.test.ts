import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { JournaDB } from './db'
import { addDays } from './date'
import { createRepo } from './repo'

let n = 0
function freshRepo() {
  const database = new JournaDB(`test-${n++}`)
  return { database, repo: createRepo(database) }
}

describe('repo', () => {
  let ctx: ReturnType<typeof freshRepo>
  beforeEach(() => {
    ctx = freshRepo()
  })

  it('creates entries with type defaults', async () => {
    const task = await ctx.repo.create({ type: 'task', title: 'Pay bill' })
    const list = await ctx.repo.create({ type: 'checklist', title: 'Groceries' })
    expect(task.done).toBe(false)
    expect(list.items).toEqual([])
    expect(task.deletedAt).toBe(0)
  })

  it('lists by type with pinned first, newest next', async () => {
    const a = await ctx.repo.create({ type: 'note', title: 'a' })
    await ctx.repo.create({ type: 'note', title: 'b' })
    await ctx.repo.create({ type: 'task', title: 't' })
    await ctx.repo.update(a.id, { pinned: 1 })
    const notes = await ctx.repo.list('note')
    expect(notes.map((e) => e.title)).toEqual(['a', 'b'])
    expect(await ctx.repo.list()).toHaveLength(3)
  })

  it('moves to trash, restores, and empties trash', async () => {
    const e = await ctx.repo.create({ type: 'note', title: 'x' })
    await ctx.repo.trash(e.id)
    expect(await ctx.repo.list()).toHaveLength(0)
    expect(await ctx.repo.listTrash()).toHaveLength(1)
    await ctx.repo.restore(e.id)
    expect(await ctx.repo.list()).toHaveLength(1)
    await ctx.repo.trash(e.id)
    expect(await ctx.repo.emptyTrash()).toBe(1)
    expect(await ctx.repo.get(e.id)).toBeUndefined()
  })

  it('keeps one journal entry per day', async () => {
    const a = await ctx.repo.ensureJournal('2026-10-12')
    const b = await ctx.repo.ensureJournal('2026-10-12')
    expect(a.id).toBe(b.id)
    const c = await ctx.repo.ensureJournal(addDays('2026-10-12', 1))
    expect(c.date).toBe('2026-10-13')
  })

  it('reports days with written journal text', async () => {
    const a = await ctx.repo.ensureJournal('2026-10-01')
    await ctx.repo.ensureJournal('2026-10-02')
    await ctx.repo.update(a.id, { body: 'hello' })
    const days = await ctx.repo.writtenDays('2026-10-01', '2026-10-31')
    expect([...days]).toEqual(['2026-10-01'])
  })

  it('counts a mood check-in as a written day', async () => {
    const a = await ctx.repo.ensureJournal('2026-10-01')
    await ctx.repo.update(a.id, { mood: 4 })
    const days = await ctx.repo.writtenDays('2026-10-01', '2026-10-31')
    expect([...days]).toEqual(['2026-10-01'])
  })

  it('stores a mood and removes it again when cleared', async () => {
    const a = await ctx.repo.ensureJournal('2026-10-01')
    await ctx.repo.update(a.id, { mood: 5 })
    expect((await ctx.repo.get(a.id))!.mood).toBe(5)
    await ctx.repo.update(a.id, { mood: undefined })
    expect((await ctx.repo.get(a.id))!.mood).toBeUndefined()
  })

  it('discards untouched new entries but keeps filled ones and journals', async () => {
    const blank = await ctx.repo.create({ type: 'note' })
    const kept = await ctx.repo.create({ type: 'note', title: 'x' })
    const j = await ctx.repo.ensureJournal('2026-10-12')
    expect(await ctx.repo.discardIfEmpty(blank.id)).toBe(true)
    expect(await ctx.repo.discardIfEmpty(kept.id)).toBe(false)
    expect(await ctx.repo.discardIfEmpty(j.id)).toBe(false)
  })

  it('searches title, body, tags and checklist items (any script)', async () => {
    await ctx.repo.create({ type: 'note', title: 'Wi-Fi', body: 'router password on fridge' })
    await ctx.repo.create({ type: 'checklist', title: 'Shop', items: [{ id: '1', text: 'தக்காளி', done: false }] })
    await ctx.repo.create({ type: 'note', title: 'यात्रा', tags: ['travel'] })
    expect((await ctx.repo.search('router')).map((e) => e.title)).toEqual(['Wi-Fi'])
    expect((await ctx.repo.search('தக்காளி')).map((e) => e.title)).toEqual(['Shop'])
    expect((await ctx.repo.search('TRAVEL')).map((e) => e.title)).toEqual(['यात्रा'])
    expect(await ctx.repo.search('   ')).toEqual([])
  })
})
