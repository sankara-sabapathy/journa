import { Pin } from 'lucide-react'
import { href } from '../app/router'
import { fromISODate, toISODate } from '../db/date'
import { repo } from '../db/repo'
import type { Entry } from '../db/types'
import { useI18n } from '../i18n'
import { ProgressKolam } from './ProgressKolam'
import { TaskCheck } from './TaskCheck'

export function useEntryTitle() {
  const { t, fmt } = useI18n()
  return (e: Entry) => {
    if (e.title.trim()) return e.title
    if (e.type === 'journal' && e.date) return fmt.date(fromISODate(e.date), { weekday: 'long', day: 'numeric', month: 'long' })
    return t('entry.untitled')
  }
}

function snippet(body: string) {
  return body
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`|~~)/g, '')
    .slice(0, 160)
}

export function DueLabel({ due }: { due: string }) {
  const { t, fmt } = useI18n()
  const today = toISODate()
  const overdue = due < today
  const text = due === today ? t('task.dueToday') : overdue ? `${t('task.overdue')} · ${fmt.date(fromISODate(due), { day: 'numeric', month: 'short' })}` : fmt.date(fromISODate(due), { day: 'numeric', month: 'short' })
  return (
    <span className="due" data-overdue={overdue || undefined}>
      {text}
    </span>
  )
}

export function TaskRow({ e }: { e: Entry }) {
  const { t } = useI18n()
  const title = useEntryTitle()(e)
  return (
    <li className={`row${e.done ? ' done' : ''}`}>
      <TaskCheck
        checked={Boolean(e.done)}
        onChange={() => void repo.toggleTask(e.id)}
        label={t(e.done ? 'task.markOpen' : 'task.markDone', { title })}
      />
      <a className="row-main" href={href({ name: 'entry', id: e.id })}>
        <span className="row-title">{title}</span>
        {(e.due || e.tags.length > 0) && (
          <span className="row-meta">
            {e.due && !e.done && <DueLabel due={e.due} />}
            {e.priority === 1 && <span>{t('task.priority.1')}</span>}
            {e.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </span>
        )}
      </a>
      {e.pinned ? <Pin className="pin-mark" size={16} aria-label={t('entry.pin')} /> : null}
    </li>
  )
}

export function EntryRow({ e, showType }: { e: Entry; showType?: boolean }) {
  const { t, fmt } = useI18n()
  const title = useEntryTitle()(e)
  if (e.type === 'task') return <TaskRow e={e} />
  const items = e.items ?? []
  const done = items.filter((i) => i.done).length
  return (
    <li className="row">
      <a className="row-main" href={e.type === 'journal' && e.date ? href({ name: 'today', date: e.date }) : href({ name: 'entry', id: e.id })}>
        <span className="row-title">{title}</span>
        {e.type === 'checklist' ? (
          <span className="list-progress">
            <ProgressKolam done={done} total={items.length} />
            {t('list.progress', { done, total: items.length })}
          </span>
        ) : (
          e.body && <span className="row-snippet">{snippet(e.body)}</span>
        )}
        <span className="row-meta">
          {showType && <span>{t(`type.${e.type}`)}</span>}
          <span>{fmt.relative(e.updatedAt)}</span>
          {e.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </span>
      </a>
      {e.pinned ? <Pin className="pin-mark" size={16} aria-label={t('entry.pin')} /> : null}
    </li>
  )
}

export function Empty({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="empty">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  )
}
