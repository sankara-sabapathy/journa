import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { IconButton } from './IconButton'
import { useEffect, useMemo, useState } from 'react'
import { href } from '../app/router'
import { toISODate } from '../db/date'
import { repo } from '../db/repo'
import { useI18n } from '../i18n'

const CELL = 40
const ROW = 36
const R = 12 // loop radius around a pulli dot

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

/** A kolam petal: a loop drawn around the dot with four curved sides. */
function loop(cx: number, cy: number) {
  const k = R * 0.552
  return `M${cx} ${cy - R}C${cx + k} ${cy - R} ${cx + R} ${cy - k} ${cx + R} ${cy}C${cx + R} ${cy + k} ${cx + k} ${cy + R} ${cx} ${cy + R}C${cx - k} ${cy + R} ${cx - R} ${cy + k} ${cx - R} ${cy}C${cx - R} ${cy - k} ${cx - k} ${cy - R} ${cx} ${cy - R}Z`
}

/** The line joining two consecutive written days: it leaves one loop and enters the next. */
function join(x1: number, x2: number, cy: number) {
  const a = x1 + R
  const b = x2 - R
  const m = (a + b) / 2
  return `M${a} ${cy}C${m} ${cy - 10} ${m} ${cy + 10} ${b} ${cy}`
}

interface Props {
  year: number
  month: number
  selected: string
  onMonth: (delta: number) => void
  onYear: (delta: number) => void
  onPick: (year: number, month: number) => void
}

export function Kolam({ year, month, selected, onMonth, onYear, onPick }: Props) {
  const { t, fmt } = useI18n()
  const [picking, setPicking] = useState(false)
  const cells = useMemo(() => monthGrid(year, month), [year, month])
  const from = cells[0].date
  const to = cells[cells.length - 1].date
  const written = useLiveQuery(() => repo.writtenDays(from, to), [from, to]) ?? new Set<string>()
  const today = toISODate()
  const rows = cells[cells.length - 1].row + 1
  const monthName = fmt.date(new Date(year, month, 1), { month: 'long', year: 'numeric' })
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.date(new Date(2026, 1, 1 + i), { weekday: 'narrow' }))

  const paths: string[] = []
  for (const c of cells) {
    if (!written.has(c.date)) continue
    const cx = c.col * CELL + CELL / 2
    const cy = c.row * ROW + ROW / 2
    paths.push(loop(cx, cy))
    const next = cells[c.day] // the following day
    if (next && next.row === c.row && written.has(next.date)) {
      paths.push(join(cx, cx + CELL, cy))
    }
  }

  const now = new Date()
  const thisYear = now.getFullYear()
  const thisMonth = now.getMonth()
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
          </div>
        </div>
        {picking && (
          <div className="kolam-picker" role="group" aria-label={t('kolam.pick')}>
            <div className="kolam-picker-year">
              <IconButton label={t('kolam.prevYear')} className="on-kaavi" onClick={() => onYear(-1)}>
                <ChevronsLeft aria-hidden />
              </IconButton>
              <span aria-live="polite">{year}</span>
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
        <p className="kolam-count">{t('kolam.written', { count: written.size })}</p>
        <div className="kolam-weekdays" aria-hidden>
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
        <div className="kolam">
          <svg viewBox={`0 0 ${CELL * 7} ${ROW * rows}`} aria-hidden>
            {paths.map((d, i) => (
              <path key={`${from}-${i}`} d={d} className="kolam-line drawn" pathLength={1} style={{ '--len': 1 } as React.CSSProperties} />
            ))}
            {cells.map((c) => {
              const cx = c.col * CELL + CELL / 2
              const cy = c.row * ROW + ROW / 2
              const future = c.date > today
              if (c.date === today)
                return <circle key={c.date} cx={cx} cy={cy} r={5} fill="var(--turmeric)" />
              return <circle key={c.date} cx={cx} cy={cy} r={future ? 1.6 : 2.6} fill="var(--rice)" opacity={future ? 0.45 : 1} />
            })}
            {cells
              .filter((c) => c.date === selected && c.date !== today)
              .map((c) => (
                <circle
                  key="sel"
                  cx={c.col * CELL + CELL / 2}
                  cy={c.row * ROW + ROW / 2}
                  r={R + 2}
                  fill="none"
                  stroke="var(--turmeric)"
                  strokeWidth={2}
                />
              ))}
          </svg>
          <div className="kolam-cells" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {cells.map((c) => {
              const label = fmt.date(new Date(year, month, c.day), { day: 'numeric', month: 'long' })
              const future = c.date > today
              const style = { gridColumn: c.col + 1, gridRow: c.row + 1 }
              if (future) return <span key={c.date} style={style} aria-hidden />
              return (
                <a
                  key={c.date}
                  className="kolam-cell"
                  style={style}
                  href={href({ name: 'today', date: c.date === today ? undefined : c.date })}
                  aria-current={c.date === selected ? 'date' : undefined}
                  aria-label={
                    (c.date === today ? `${t('kolam.today')}, ` : '') +
                    t(written.has(c.date) ? 'kolam.day' : 'kolam.dayEmpty', { date: label })
                  }
                />
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
