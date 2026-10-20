import { describe, expect, it } from 'vitest'
import { href, parseRoute } from './router'

describe('parseRoute', () => {
  it('keeps the known routes', () => {
    expect(parseRoute('#/today')).toEqual({ name: 'today', date: undefined })
    expect(parseRoute('#/today/2026-10-20')).toEqual({ name: 'today', date: '2026-10-20' })
    expect(parseRoute('#/notes?tag=home')).toEqual({ name: 'notes', tag: 'home' })
    expect(parseRoute('#/entry/abc')).toEqual({ name: 'entry', id: 'abc' })
    expect(parseRoute('#/journal')).toEqual({ name: 'journal' })
  })

  it('falls back to Today for the bare app', () => {
    expect(parseRoute('')).toEqual({ name: 'today', date: undefined })
    expect(parseRoute('#/')).toEqual({ name: 'today', date: undefined })
  })

  it('reports unknown links as not found', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found' })
    expect(parseRoute('#/entry')).toEqual({ name: 'not-found' })
    expect(parseRoute('#/today/not-a-date')).toEqual({ name: 'today', date: undefined })
  })
})

describe('href', () => {
  it('builds links that parse back', () => {
    expect(parseRoute(href({ name: 'today', date: '2026-10-20' }))).toEqual({ name: 'today', date: '2026-10-20' })
    expect(parseRoute(href({ name: 'entry', id: 'abc' }))).toEqual({ name: 'entry', id: 'abc' })
    expect(parseRoute(href({ name: 'notes', tag: 'a b' }))).toEqual({ name: 'notes', tag: 'a b' })
  })
})
