import { useLiveQuery } from 'dexie-react-hooks'
import { href } from '../app/router'
import { repo } from '../db/repo'
import { useI18n } from '../i18n'
import { Empty } from '../components/EntryRows'

function excerpt(body: string): string {
  const first = body.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return first.length > 140 ? `${first.slice(0, 140)}…` : first
}

/** Every journal entry, newest first. The kolam navigates by day; this browses by content. */
export function Journal() {
  const { t, fmt } = useI18n()
  const rows = useLiveQuery(() => repo.list('journal'), []) ?? []
  const shown = [...rows]
    .filter((e) => e.date)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt)
  return (
    <div>
      {shown.length ? (
        <ul className="rows panel">
          {shown.map((e) => (
            <li key={e.id} className="row">
              <a className="row-main" href={href({ name: 'entry', id: e.id })}>
                <span className="row-title">
                  {e.date ? fmt.date(new Date(`${e.date}T00:00:00`), { weekday: 'long', day: 'numeric', month: 'long' }) : t('entry.untitled')}
                </span>
                {excerpt(e.body) && <span className="row-snippet">{excerpt(e.body)}</span>}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('journal.empty')}</Empty>
      )}
    </div>
  )
}
