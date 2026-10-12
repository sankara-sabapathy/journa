import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { href } from '../app/router'
import { toISODate } from '../db/date'
import { repo } from '../db/repo'
import { EntryRow, Empty, TaskRow } from '../components/EntryRows'
import { Segmented } from '../components/Segmented'
import { useI18n } from '../i18n'

export function Notes({ tag }: { tag?: string }) {
  const { t } = useI18n()
  const notes = useLiveQuery(() => repo.list('note'), []) ?? []
  const tags = useLiveQuery(() => repo.allTags(), []) ?? []
  const shown = tag ? notes.filter((e) => e.tags.includes(tag)) : notes
  return (
    <div>
      {tags.length > 0 && (
        <div className="filters" role="group" aria-label={t('notes.filterTag')}>
          <a className="filter" aria-pressed={!tag} href={href({ name: 'notes' })} role="button">
            {t('notes.allTags')}
          </a>
          {tags.map((x) => (
            <a key={x} className="filter" aria-pressed={tag === x} href={href({ name: 'notes', tag: x })} role="button">
              #{x}
            </a>
          ))}
        </div>
      )}
      {shown.length ? (
        <ul className="rows panel">
          {shown.map((e) => (
            <EntryRow key={e.id} e={e} />
          ))}
        </ul>
      ) : (
        <Empty>{t('notes.empty')}</Empty>
      )}
    </div>
  )
}

type TaskFilter = 'today' | 'upcoming' | 'all' | 'done'

export function Tasks() {
  const { t } = useI18n()
  const [filter, setFilter] = useState<TaskFilter>('today')
  const tasks = useLiveQuery(() => repo.list('task'), []) ?? []
  const today = toISODate()
  const open = tasks.filter((e) => !e.done)
  const byDue = (a: { due?: string }, b: { due?: string }) => (a.due ?? '9').localeCompare(b.due ?? '9')
  const shown = {
    today: open.filter((e) => e.due && e.due <= today).sort(byDue),
    upcoming: open.filter((e) => e.due && e.due > today).sort(byDue),
    all: [...open].sort((a, b) => (a.priority ?? 4) - (b.priority ?? 4) || byDue(a, b)),
    done: tasks.filter((e) => e.done),
  }[filter]
  return (
    <div>
      <Segmented
        label={t('nav.tasks')}
        value={filter}
        onChange={setFilter}
        className="mb-3"
        options={(['today', 'upcoming', 'all', 'done'] as const).map((f) => ({ value: f, label: t(`tasks.filter.${f}`) }))}
      />
      {shown.length ? (
        <ul className="rows panel">
          {shown.map((e) => (
            <TaskRow key={e.id} e={e} />
          ))}
        </ul>
      ) : (
        <Empty>{t(`tasks.empty.${filter}`)}</Empty>
      )}
    </div>
  )
}

export function Lists() {
  const { t } = useI18n()
  const lists = useLiveQuery(() => repo.list('checklist'), []) ?? []
  return lists.length ? (
    <ul className="rows panel">
      {lists.map((e) => (
        <EntryRow key={e.id} e={e} />
      ))}
    </ul>
  ) : (
    <Empty>{t('lists.empty')}</Empty>
  )
}
