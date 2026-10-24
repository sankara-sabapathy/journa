import { useEffect, useId, useRef, useState } from 'react'
import { repo } from '../db/repo'
import type { Mood } from '../db/types'
import { useI18n } from '../i18n'
import { composeEntry, headingOf, questionsFor, type Question } from '../journal/interview'
import type { QuestionSet } from '../journal/sets'
import { MoodPicker } from './MoodPicker'
import { ProgressKolam } from './ProgressKolam'

export interface JournalDoc {
  body: string
  mood: Mood | null
}

type Step = 'mood' | Question

/**
 * Asks about the day one question at a time and writes the answers into the day's journal
 * as Markdown. Every change is saved as it happens, so leaving midway keeps what was typed.
 */
export function Interview({
  date,
  doc,
  set,
  onFinish,
}: {
  date: string
  doc: JournalDoc
  /** The user's own questions, or null for Journa's rotating ones. */
  set: QuestionSet | null
  onFinish: (doc: JournalDoc) => void
}) {
  const { t } = useI18n()
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const [steps] = useState<Step[]>(() => [
    ...(doc.mood === null ? (['mood'] as const) : []),
    ...questionsFor(date, doc.body, t, set?.questions),
  ])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [mood, setMood] = useState<Mood | null>(doc.mood)

  const answersRef = useRef(answers)
  const moodRef = useRef(mood)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const refocus = useRef(false)
  const questionId = useId()

  /** What the journal would say with the answers so far. */
  function current(): JournalDoc {
    const sections = steps.flatMap((s, i) =>
      s === 'mood' ? [] : [{ heading: headingOf(s, tRef.current), text: answersRef.current[i] ?? '' }],
    )
    return { body: composeEntry(doc.body, sections), mood: moodRef.current }
  }

  async function flush() {
    if (!dirty.current) return
    dirty.current = false
    const { body, mood: m } = current()
    await repo.saveJournal(date, body, m)
  }

  function schedule() {
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }

  async function finish() {
    clearTimeout(timer.current)
    await flush()
    onFinish(current())
  }

  function go(delta: 1 | -1) {
    const next = step + delta
    if (next >= steps.length) return void finish()
    if (next < 0) return
    refocus.current = true
    setStep(next)
  }

  useEffect(() => {
    if (steps.length === 0) void finish()
    return () => void flush()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (refocus.current) textRef.current?.focus()
  }, [step])

  const question = steps[step]
  if (question === undefined) return null
  const last = step === steps.length - 1

  return (
    <div className="panel journal-card ask">
      <div
        className="ask-progress"
        role="progressbar"
        aria-label={t('today.journal')}
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step + 1}
        aria-valuetext={t('ask.step', { step: step + 1, total: steps.length })}
      >
        <ProgressKolam done={step + 1} total={steps.length} />
      </div>
      <h3 id={questionId} className="ask-question">
        {question === 'mood' ? t('ask.mood') : headingOf(question, t)}
      </h3>
      {question === 'mood' ? (
        <MoodPicker
          mood={mood}
          onChange={(next) => {
            setMood(next)
            moodRef.current = next
            schedule()
            if (next !== null) go(1)
          }}
        />
      ) : (
        <textarea
          ref={textRef}
          aria-labelledby={questionId}
          rows={4}
          value={answers[step] ?? ''}
          onChange={(e) => {
            const next = { ...answersRef.current, [step]: e.target.value }
            answersRef.current = next
            setAnswers(next)
            schedule()
          }}
          onBlur={() => void flush()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(1)
          }}
        />
      )}
      <div className="ask-actions">
        <button type="button" className="btn btn-quiet" onClick={() => void finish()}>
          {t('ask.write')}
        </button>
        {step > 0 && (
          <button type="button" className="btn" onClick={() => go(-1)}>
            {t('ask.back')}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => go(1)}>
          {t(last ? 'ask.finish' : 'ask.next')}
        </button>
      </div>
    </div>
  )
}
