import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { href } from '../app/router'
import { fromISODate, toISODate } from '../db/date'
import { repo } from '../db/repo'
import type { Entry } from '../db/types'
import { EntryRow, Empty, TaskRow } from '../components/EntryRows'
import { Kolam } from '../components/Kolam'
import { MarkdownToolbar } from '../components/MarkdownToolbar'
import { useI18n } from '../i18n'

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
    />
  )
}

function JournalEditor({ date, entry }: { date: string; entry: Entry | undefined }) {
  const { t, fmt } = useI18n()
  const [text, setText] = useState(entry?.body ?? '')
  const [saved, setSaved] = useState<number | null>(entry?.updatedAt ?? null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function flush() {
    if (pending.current === null) return
    const body = pending.current
    pending.current = null
    const e = await repo.ensureJournal(date)
    await repo.update(e.id, { body })
    setSaved(Date.now())
  }

  useEffect(() => () => void flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === toISODate()
  return (
    <div className="panel journal-card">
      <MarkdownToolbar
        target={textRef}
        onChange={(next) => {
          setText(next)
          pending.current = next
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), 500)
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
          pending.current = e.target.value
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), 500)
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

export function Today({ date }: { date: string }) {
  const { t } = useI18n()
  const journal = useLiveQuery(async () => ({ d: date, e: await repo.journalFor(date) }), [date])
  const tasks = useLiveQuery(() => repo.list('task'), []) ?? []
  const lists = useLiveQuery(() => repo.list('checklist'), []) ?? []
  const today = toISODate()

  const open = tasks.filter((e) => !e.done)
  const dueNow = open.filter((e) => !e.due || e.due <= today)
  const shown = [...dueNow, ...tasks.filter((e) => e.done && e.updatedAt > fromISODate(today).getTime())].slice(0, 8)

  return (
    <div>
      <section className="section" aria-labelledby="h-journal">
        <div className="section-head">
          <h2 id="h-journal">{t('today.journal')}</h2>
          <a href={href({ name: 'journal' })}>{t('today.allJournals')}</a>
        </div>
        {journal && journal.d === date ? (
          <JournalEditor key={date} date={date} entry={journal.e} />
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
  )
}
