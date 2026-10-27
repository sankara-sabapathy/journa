import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { IconButton } from './IconButton'
import { useEffect, useMemo, useState } from 'react'
import { href } from '../app/router'
import { toISODate } from '../db/date'
import { repo } from '../db/repo'
import { useI18n } from '../i18n'

/** One cell per day of the month, weeks as rows, Sunday first. */
export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const days = new Date(year, month + 1, 0).getDate()
  const offset = first.getDay()
  return Array.from({ length: days }, (_, i) => {
    const idx = offset + i
    return { day: i + 1, date: toISODate(new Date(year, month, i + 1)), col: idx % 7, row: Math.floor(idx / 7) }
  })
}

/** How many blank cells lead the month (Sunday-first). */
export function monthOffset(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function BorderMark({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden focusable="false">
      <circle cx="50%" cy="50%" r="46%" fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

interface Props {
  year: number
  month: number
  selected: string
  onMonth: (delta: number) => void
  onYear: (delta: number) => void
  onPick: (year: number, month: number) => void
  /** Called when a day is chosen, e.g. to close the surrounding sheet. */
  onDatePicked?: () => void
  /** Show the grid even on phones (no collapse toggle). */
  forceExpanded?: boolean
}

export function Kolam({ year, month, selected, onMonth, onYear, onPick, onDatePicked, forceExpanded = false }: Props) {
  const { t, fmt } = useI18n()
  const [picking, setPicking] = useState(false)
  const [collapsed, setCollapsed] = useState(() =>
    !forceExpanded && typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches,
  )
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const from = cells[0].date
  const to = cells[cells.length - 1].date
  const written = useLiveQuery(() => repo.writtenDays(from, to), [from, to]) ?? new Set<string>()
  const today = toISODate()
  const offset = monthOffset(year, month)
  const monthName = fmt.date(new Date(year, month, 1), { month: 'long', year: 'numeric' })
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.date(new Date(2026, 1, 1 + i), { weekday: 'narrow' }))

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
  const years = useMemo(() => {
    const start = thisYear - 100
    return Array.from({ length: thisYear - start + 1 }, (_, i) => start + i)
  }, [thisYear])
  useEffect(() => {
    if (!picking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicking(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])
  const monthNames = Array.from({ length: 12 }, (_, m) => fmt.date(new Date(year, m, 1), { month: 'long' }))
  const isFutureMonth = (y: number, m: number) => y > thisYear || (y === thisYear && m > thisMonth)

  return (
    <section className="kolam-band" aria-labelledby="kolam-title">
      <div className="kolam-inner">
        <div className="kolam-side">
          <div className="kolam-head">
            <h2 id="kolam-title">
              <button
                type="button"
                className="kolam-title-button"
                aria-expanded={picking}
                aria-label={`${monthName}, ${t('kolam.pick')}`}
                onClick={() => setPicking((v) => !v)}
              >
                {monthName}
                <ChevronDown aria-hidden />
              </button>
            </h2>
            <div className="kolam-nav">
              <IconButton label={t('kolam.prevYear')} className="on-kaavi" onClick={() => onYear(-1)}>
                <ChevronsLeft aria-hidden />
              </IconButton>
              <IconButton label={t('kolam.prev')} className="on-kaavi" onClick={() => onMonth(-1)}>
                <ChevronLeft aria-hidden />
              </IconButton>
              <IconButton
                label={t('kolam.next')}
                className="on-kaavi"
                onClick={() => onMonth(1)}
                disabled={new Date(year, month + 1, 1) > new Date()}
              >
                <ChevronRight aria-hidden />
              </IconButton>
              <IconButton
                label={t('kolam.nextYear')}
                className="on-kaavi"
                onClick={() => onYear(1)}
                disabled={year + 1 > new Date().getFullYear()}
              >
                <ChevronsRight aria-hidden />
              </IconButton>
              {!forceExpanded && (
                <IconButton
                  label={collapsed ? t('kolam.showCalendar') : t('kolam.hideCalendar')}
                  className="on-kaavi kolam-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  <CalendarDays aria-hidden />
                </IconButton>
              )}
            </div>
          </div>
          <p className="kolam-count">{t('kolam.written', { count: written.size })}</p>
        </div>
        {!collapsed && (
        <div className="kolam-grid">
          <div className="kolam-weekdays" aria-hidden>
            {weekdays.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="kolam-days">
            {Array.from({ length: offset }).map((_, i) => (
              <span key={`blank-${i}`} className="kolam-day blank" aria-hidden />
            ))}
            {cells.map((c) => {
              const future = c.date > today
              const isToday = c.date === today
              const isSelected = c.date === selected
              const isWritten = written.has(c.date)
              const label = fmt.date(new Date(year, month, c.day), { day: 'numeric', month: 'long', weekday: 'long' })
              if (future) {
                return (
                  <span key={c.date} className="kolam-day future" aria-hidden>
                    {c.day}
                  </span>
                )
              }
              return (
                <a
                  key={c.date}
                  className={`kolam-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${isWritten ? ' written' : ''}`}
                  href={href({ name: 'today', date: isToday ? undefined : c.date })}
                  onClick={() => onDatePicked?.()}
                  aria-current={isSelected ? 'date' : undefined}
                  aria-label={
                    (isToday ? `${t('kolam.today')}, ` : '') +
                    t(isWritten ? 'kolam.day' : 'kolam.dayEmpty', { date: label })
                  }
                >
                  <span className="kolam-day-num">{c.day}</span>
                  {isWritten && <BorderMark className="kolam-day-loop" />}
                </a>
              )
            })}
          </div>
        </div>
        )}
        {picking && <div className="kolam-scrim" onClick={() => setPicking(false)} aria-hidden />}
        {picking && (
          <div className="kolam-picker" role="group" aria-label={t('kolam.pick')}>
            <div className="kolam-picker-year">
              <IconButton label={t('kolam.prevYear')} className="on-kaavi" onClick={() => onYear(-1)}>
                <ChevronsLeft aria-hidden />
              </IconButton>
              <label className="kolam-picker-year-label">
                <span className="sr-only">{t('kolam.year')}</span>
                <select
                  className="kolam-picker-year-select"
                  value={year}
                  onChange={(e) => onPick(Number(e.target.value), month)}
                  aria-label={t('kolam.year')}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <IconButton
                label={t('kolam.nextYear')}
                className="on-kaavi"
                onClick={() => onYear(1)}
                disabled={year + 1 > new Date().getFullYear()}
              >
                <ChevronsRight aria-hidden />
              </IconButton>
            </div>
            <div className="kolam-picker-months">
              {monthNames.map((name, m) => (
                <button
                  key={m}
                  type="button"
                  className="kolam-picker-month"
                  aria-current={m === month ? 'date' : undefined}
                  disabled={isFutureMonth(year, m)}
                  onClick={() => {
                    onPick(year, m)
                    setPicking(false)
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
