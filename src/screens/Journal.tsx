import { useLiveQuery } from 'dexie-react-hooks'
import { href, navigate } from '../app/router'
import { fromISODate } from '../db/date'
import { repo } from '../db/repo'
import { useI18n } from '../i18n'
import { Empty } from '../components/EntryRows'
import { MoodMark } from '../components/MoodPicker'

function excerpt(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  // Asked-for entries open with a question heading; the first answer says more.
  const first = (lines.find((l) => !l.startsWith('#')) ?? lines[0]?.replace(/^#+\s*/, '') ?? '').trim()
  return first.length > 140 ? `${first.slice(0, 140)}…` : first
}

/** Every journal entry, newest first. The kolam navigates by day; this browses by content. */
export function Journal() {
  const { t, fmt } = useI18n()
  const rows = useLiveQuery(() => repo.list('journal'), []) ?? []
  const shown = [...rows]
    .filter((e) => e.date && (e.body.trim() !== '' || e.mood !== undefined))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt - a.updatedAt)
  return (
    <div>
      {shown.length ? (
        <ul className="rows panel">
          {shown.map((e) => (
            <li key={e.id} className="row">
              <a className="row-main" href={href({ name: 'entry', id: e.id })}>
                <span className="row-title">
                  {e.date ? fmt.date(fromISODate(e.date), { weekday: 'long', day: 'numeric', month: 'long' }) : t('entry.untitled')}
                </span>
                {excerpt(e.body) && <span className="row-snippet">{excerpt(e.body)}</span>}
              </a>
              <MoodMark mood={e.mood} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty action={{ label: t('journal.writeToday'), onClick: () => navigate({ name: 'today' }) }}>{t('journal.empty')}</Empty>
      )}
    </div>
  )
}
