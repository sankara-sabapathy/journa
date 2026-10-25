import { useLiveQuery } from 'dexie-react-hooks'
import { MessageCircleQuestionMark } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { href } from '../app/router'
import { fromISODate, toISODate } from '../db/date'
import { repo } from '../db/repo'
import type { Entry, Mood } from '../db/types'
import { EntryRow, Empty, TaskRow } from '../components/EntryRows'
import { Interview, type JournalDoc } from '../components/Interview'
import { Kolam } from '../components/Kolam'
import { MarkdownToolbar } from '../components/MarkdownToolbar'
import { MoodPicker } from '../components/MoodPicker'
import { useI18n } from '../i18n'
import { isBlank, questionsFor } from '../journal/interview'
import { setsStore, type QuestionSet } from '../journal/sets'

export function wordCount(s: string) {
  return s.trim() ? s.trim().split(/\s+/u).length : 0
}

export function TodayKolam({ date }: { date: string }) {
  const d = fromISODate(date)
  const [ym, setYm] = useState({ y: d.getFullYear(), m: d.getMonth() })
  useEffect(() => setYm({ y: d.getFullYear(), m: d.getMonth() }), [date]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Kolam
      year={ym.y}
      month={ym.m}
      selected={date}
      onMonth={(delta) => {
        const n = new Date(ym.y, ym.m + delta, 1)
        setYm({ y: n.getFullYear(), m: n.getMonth() })
      }}
      onYear={(delta) => setYm({ y: ym.y + delta, m: ym.m })}
      onPick={(y, m) => setYm({ y, m })}
    />
  )
}

function JournalEditor({
  date,
  doc,
  savedAt,
  set,
  onAsk,
}: {
  date: string
  doc: JournalDoc
  savedAt: number | null
  set: QuestionSet | null
  onAsk: (doc: JournalDoc) => void
}) {
  const { t, fmt } = useI18n()
  const [text, setText] = useState(doc.body)
  const [mood, setMood] = useState<Mood | null>(doc.mood)
  const [saved, setSaved] = useState<number | null>(savedAt)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dirty = useRef(false)
  const bodyRef = useRef(doc.body)
  const moodRef = useRef<Mood | null>(doc.mood)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    if (dirty.current) return
    if (doc.body !== bodyRef.current) {
      setText(doc.body)
      bodyRef.current = doc.body
    }
    if (doc.mood !== moodRef.current) {
      setMood(doc.mood)
      moodRef.current = doc.mood
    }
  }, [doc.body, doc.mood]) // eslint-disable-line react-hooks/exhaustive-deps

  async function flush() {
    if (!dirty.current) return
    dirty.current = false
    if (await repo.saveJournal(date, bodyRef.current, moodRef.current)) {
      if (mounted.current) setSaved(Date.now())
    }
  }

  function schedule() {
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void flush()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === toISODate()
  const canAsk = questionsFor(date, text, t, set?.questions).length > 0
  return (
    <div className="panel journal-card">
      <div className="journal-head">
        <MoodPicker
          mood={mood}
          onChange={(next) => {
            setMood(next)
            moodRef.current = next
            schedule()
          }}
        />
        {canAsk && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              clearTimeout(timer.current)
              void flush()
              onAsk({ body: bodyRef.current, mood: moodRef.current })
            }}
          >
            <MessageCircleQuestionMark aria-hidden size={18} />
            {t('ask.start')}
          </button>
        )}
      </div>
      <MarkdownToolbar
        target={textRef}
        onChange={(next) => {
          setText(next)
          bodyRef.current = next
          schedule()
        }}
      />
      <textarea
        id="journal-text"
        ref={textRef}
        aria-label={t('today.journal')}
        value={text}
        placeholder={t('today.journalPlaceholder')}
        onChange={(e) => {
          setText(e.target.value)
          bodyRef.current = e.target.value
          schedule()
        }}
        onBlur={() => void flush()}
        rows={isToday ? 5 : 8}
      />
      <div className="journal-foot">
        <span>{t('entry.words', { count: wordCount(text) })}</span>
        <span aria-live="polite">{saved ? t('entry.edited', { time: fmt.date(saved, { hour: 'numeric', minute: '2-digit' }) }) : ''}</span>
      </div>
    </div>
  )
}

/** A day with nothing yet is asked about; a day with writing opens the editor. */
function JournalCard({
  date,
  entry,
  set,
}: {
  date: string
  entry: Entry | undefined
  set: QuestionSet | null
}) {
  const [asking, setAsking] = useState(isBlank(entry))
  const [doc, setDoc] = useState<JournalDoc>({ body: entry?.body ?? '', mood: entry?.mood ?? null })
  const [savedAt, setSavedAt] = useState(entry?.updatedAt ?? null)
  useEffect(() => {
    // Re-evaluate mode when the entry changes externally (sync, another tab).
    if (asking) return
    setAsking(isBlank(entry))
    setDoc({ body: entry?.body ?? '', mood: entry?.mood ?? null })
    setSavedAt(entry?.updatedAt ?? null)
  }, [entry?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  return asking ? (
    <Interview
      date={date}
      doc={doc}
      set={set}
      onFinish={(next) => {
        setDoc(next)
        setSavedAt(isBlank({ body: next.body, mood: next.mood ?? undefined }) ? null : Date.now())
        setAsking(false)
      }}
    />
  ) : (
    <JournalEditor
      date={date}
      doc={doc}
      savedAt={savedAt}
      set={set}
      onAsk={(next) => {
        setDoc(next)
        setAsking(true)
      }}
    />
  )
}

export function Today({ date }: { date: string }) {
  const { t } = useI18n()
  const journal = useLiveQuery(async () => ({ d: date, e: await repo.journalFor(date) }), [date])
  const set = useLiveQuery(() => setsStore.active(), [])
  const tasks = useLiveQuery(() => repo.list('task'), []) ?? []
  const lists = useLiveQuery(() => repo.list('checklist'), []) ?? []
  const today = toISODate()

  const open = tasks.filter((e) => !e.done)
  const dueNow = open.filter((e) => !e.due || e.due <= today)
  const shown = [...dueNow, ...tasks.filter((e) => e.done && e.updatedAt > fromISODate(today).getTime())].slice(0, 8)

  return (
    <div className="today">
      <div className="today-side">
        <TodayKolam date={date} />
      </div>
      <div className="today-main">
      <section className="section" aria-labelledby="h-journal">
        <div className="section-head">
          <h2 id="h-journal">{t('today.journal')}</h2>
          <a href={href({ name: 'journal' })}>{t('today.allJournals')}</a>
        </div>
        {journal && journal.d === date && set !== undefined ? (
          <JournalCard key={date} date={date} entry={journal.e} set={set} />
        ) : (
          <div className="panel journal-card" style={{ minHeight: 160 }} />
        )}
      </section>

      {date === today && (
        <>
          <section className="section" aria-labelledby="h-tasks">
            <div className="section-head">
              <h2 id="h-tasks">
                {t('today.tasks')} · {t('today.tasksLeft', { count: dueNow.length })}
              </h2>
              <a href={href({ name: 'tasks' })}>{t('today.allTasks')}</a>
            </div>
            {shown.length ? (
              <ul className="rows panel">
                {shown.map((e) => (
                  <TaskRow key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <Empty>{t('today.noTasks')}</Empty>
            )}
          </section>

          <section className="section" aria-labelledby="h-lists">
            <div className="section-head">
              <h2 id="h-lists">{t('today.lists')}</h2>
              <a href={href({ name: 'lists' })}>{t('today.allLists')}</a>
            </div>
            {lists.length ? (
              <ul className="rows panel">
                {lists.slice(0, 3).map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <Empty>{t('today.noLists')}</Empty>
            )}
          </section>
        </>
      )}
      </div>
    </div>
  )
}
