import { describe, expect, it } from 'vitest'
import { addDays } from '../db/date'
import { en } from '../i18n/en'
import type { MessageKey } from '../i18n/en'
import { composeEntry, headingOf, isBlank, questionsFor } from './interview'

const label = (key: MessageKey) => en[key]
const shown = (qs: ReturnType<typeof questionsFor>) => qs.map((q) => headingOf(q, label))

describe('questionsFor', () => {
  it('opens with the same question and asks three distinct ones', () => {
    for (let i = 0; i < 40; i++) {
      const qs = shown(questionsFor(addDays('2026-01-01', i), '', label))
      expect(qs[0]).toBe(en['ask.q.filled'])
      expect(qs).toHaveLength(3)
      expect(new Set(qs).size).toBe(3)
    }
  })

  it('is stable for a day and varies across days', () => {
    expect(questionsFor('2026-10-24', '', label)).toEqual(questionsFor('2026-10-24', '', label))
    const days = new Set(Array.from({ length: 10 }, (_, i) => shown(questionsFor(addDays('2026-10-01', i), '', label)).join()))
    expect(days.size).toBeGreaterThan(5)
  })

  it('moves on to new questions once some are answered', () => {
    const first = questionsFor('2026-10-24', '', label)
    const body = composeEntry('', first.map((q) => ({ heading: headingOf(q, label), text: 'x' })))
    const next = questionsFor('2026-10-24', body, label)
    expect(next).toHaveLength(3)
    expect(next.some((q) => first.includes(q))).toBe(false)
  })

  it('runs out when every question has been answered', () => {
    let body = ''
    for (let i = 0; i < 4; i++) {
      const qs = questionsFor('2026-10-24', body, label)
      body = composeEntry(body, qs.map((q) => ({ heading: headingOf(q, label), text: 'x' })))
    }
    expect(questionsFor('2026-10-24', body, label)).toEqual([])
  })
})

describe('questionsFor with a set of your own', () => {
  const own = ['What did I build?', 'Who did I help?', 'What tired me?']

  it('asks the set in the user’s order, in their own words', () => {
    expect(shown(questionsFor('2026-10-24', '', label, own))).toEqual(own)
  })

  it('skips the ones already answered that day', () => {
    const body = composeEntry('', [{ heading: own[0], text: 'A shelf.' }])
    expect(shown(questionsFor('2026-10-24', body, label, own))).toEqual(own.slice(1))
  })

  it('ignores an empty set and falls back to Journa’s questions', () => {
    expect(shown(questionsFor('2026-10-24', '', label, []))).toEqual(shown(questionsFor('2026-10-24', '', label)))
    expect(shown(questionsFor('2026-10-24', '', label, ['  ']))).toHaveLength(3)
  })
})

describe('headingOf', () => {
  it('translates Journa’s questions and leaves the user’s alone', () => {
    expect(headingOf({ key: 'ask.q.best' }, label)).toBe(en['ask.q.best'])
    expect(headingOf({ text: 'What did I build?' }, label)).toBe('What did I build?')
  })
})

describe('composeEntry', () => {
  it('formats answers as Markdown sections and drops blank ones', () => {
    const body = composeEntry('', [
      { heading: 'What filled your day?', text: '  Market and a long walk.  ' },
      { heading: 'What was hard?', text: '   ' },
      { heading: 'What did you learn?', text: 'Line one\nLine two\n\nNew paragraph' },
    ])
    expect(body).toBe(
      '## What filled your day?\n\nMarket and a long walk.\n\n## What did you learn?\n\nLine one  \nLine two\n\nNew paragraph',
    )
  })

  it('appends to what is already written', () => {
    expect(composeEntry('Earlier text.\n', [{ heading: 'Q', text: 'A' }])).toBe('Earlier text.\n\n## Q\n\nA')
  })

  it('returns the base untouched when nothing was answered', () => {
    expect(composeEntry('Keep me', [{ heading: 'Q', text: '' }])).toBe('Keep me')
    expect(composeEntry('', [])).toBe('')
  })
})

describe('isBlank', () => {
  it('treats a mood as something written', () => {
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank({ body: '  ' })).toBe(true)
    expect(isBlank({ body: '', mood: 3 })).toBe(false)
    expect(isBlank({ body: 'hi' })).toBe(false)
  })
})
