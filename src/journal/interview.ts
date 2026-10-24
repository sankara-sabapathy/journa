import { fromISODate } from '../db/date'
import type { MessageKey } from '../i18n/en'

export const QUESTIONS_PER_ROUND = 3

/** Always asked first on a fresh day. */
const OPENER: MessageKey = 'ask.q.filled'

/** Rotated by date so each day gets a different pair. */
const BANK: readonly MessageKey[] = [
  'ask.q.best',
  'ask.q.hard',
  'ask.q.people',
  'ask.q.grateful',
  'ask.q.learned',
  'ask.q.smile',
  'ask.q.ahead',
  'ask.q.done',
  'ask.q.differently',
  'ask.q.mind',
]

export interface Section {
  heading: string
  text: string
}

/** A question is either one of Journa's own (translated) or the user's own words. */
export type Question = { key: MessageKey } | { text: string }

export function headingOf(question: Question, label: (key: MessageKey) => string): string {
  return 'key' in question ? label(question.key) : question.text
}

function dayNumber(date: string): number {
  return Math.floor(fromISODate(date).getTime() / 86_400_000)
}

/** The same day always gets the same questions, in the same order. */
function orderFor(date: string): MessageKey[] {
  const n = dayNumber(date)
  const first = ((n % BANK.length) + BANK.length) % BANK.length
  const jump = 1 + (Math.floor(Math.abs(n) / BANK.length) % (BANK.length - 1))
  const second = (first + jump) % BANK.length
  const rest = BANK.filter((_, i) => i !== first && i !== second)
  return [OPENER, BANK[first], BANK[second], ...rest]
}

function hasHeading(body: string, heading: string): boolean {
  return body.split('\n').some((line) => line.trim() === `## ${heading}`)
}

/**
 * Questions for a day, skipping any already answered in `body`, so asking again
 * on the same day moves on to fresh ones. With a custom set the questions are asked
 * in the user's order; without one, Journa's own three rotate by date.
 */
export function questionsFor(
  date: string,
  body: string,
  label: (key: MessageKey) => string,
  custom?: readonly string[],
): Question[] {
  const own = (custom ?? []).map((text) => text.trim()).filter((text) => text !== '')
  if (own.length > 0) {
    return own.filter((text) => !hasHeading(body, text)).map((text) => ({ text }))
  }
  return orderFor(date)
    .filter((key) => !hasHeading(body, label(key)))
    .slice(0, QUESTIONS_PER_ROUND)
    .map((key) => ({ key }))
}

/** Appends each answered question to `base` as a Markdown section. Unanswered ones are left out. */
export function composeEntry(base: string, sections: Section[]): string {
  const written = sections
    .map((s) => ({ heading: s.heading, text: s.text.trim() }))
    .filter((s) => s.text !== '')
    .map((s) => `## ${s.heading}\n\n${keepLineBreaks(s.text)}`)
  return [base.trimEnd(), ...written].filter((part) => part !== '').join('\n\n')
}

/** A single newline would collapse into a space when rendered; make it a hard break. */
function keepLineBreaks(text: string): string {
  return text.replace(/([^\n])\n(?=[^\n])/g, '$1  \n')
}

export function isBlank(entry: { body: string; mood?: number } | undefined): boolean {
  return !entry || (entry.body.trim() === '' && entry.mood === undefined)
}
