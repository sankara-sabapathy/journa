import { useEffect, useRef, useState } from 'react'
import { fromISODate } from '../db/date'
import { useI18n } from '../i18n'
import { Kolam } from './Kolam'

/** The month grid, shown on demand from the header calendar button. */
export function CalendarSheet({ selected, onClose }: { selected: string; onClose: () => void }) {
  const { t } = useI18n()
  const initial = fromISODate(selected)
  const [ym, setYm] = useState({ y: initial.getFullYear(), m: initial.getMonth() })
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="calendar-overlay">
      <div className="calendar-scrim" onClick={onClose} aria-hidden />
      <div
        className="calendar-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('calendar.title')}
        tabIndex={-1}
        ref={sheetRef}
      >
        <Kolam
          year={ym.y}
          month={ym.m}
          selected={selected}
          forceExpanded
          onMonth={(delta) => {
            const n = new Date(ym.y, ym.m + delta, 1)
            setYm({ y: n.getFullYear(), m: n.getMonth() })
          }}
          onYear={(delta) => setYm({ y: ym.y + delta, m: ym.m })}
          onPick={(y, m) => setYm({ y, m })}
          onDatePicked={onClose}
        />
      </div>
    </div>
  )
}
