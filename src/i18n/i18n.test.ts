import { describe, expect, it } from 'vitest'
import { en } from './en'
import { formatMessage } from './format'
import { hi } from './hi'
import { ta } from './ta'

describe('formatMessage', () => {
  it('fills variables', () => {
    expect(formatMessage('Hi {name}', { name: 'Ana' })).toBe('Hi Ana')
  })
  it('handles plurals with # and nested variables', () => {
    const m = '{count, plural, one {# day} other {# days}} in {month}'
    expect(formatMessage(m, { count: 1, month: 'Oct' })).toBe('1 day in Oct')
    expect(formatMessage(m, { count: 9, month: 'Oct' })).toBe('9 days in Oct')
  })
  it('formats numbers for the locale', () => {
    expect(formatMessage('{n}', { n: 12345 }, 'hi')).toBe('12,345')
  })
})

describe('catalogs', () => {
  for (const [name, cat] of Object.entries({ ta, hi })) {
    it(`${name} has exactly the English keys and the same variables`, () => {
      expect(Object.keys(cat).sort()).toEqual(Object.keys(en).sort())
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const vars = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
        expect(vars(cat[key]), key).toEqual(vars(en[key]))
        expect(() => formatMessage(cat[key], { count: 2, done: 1, total: 2 }, name)).not.toThrow()
      }
    })
  }
})
