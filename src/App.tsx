import { BookOpen, CalendarDays, CheckSquare, ListChecks, NotebookPen, Plus, Search as SearchIcon, Settings as SettingsIcon, StickyNote } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { href, navigate, useRoute, type Route } from './app/router'
import { Toasts } from './app/toasts'
import { BackupChip } from './components/BackupChip'
import { IconButton } from './components/IconButton'
import { fromISODate, toISODate } from './db/date'
import { repo } from './db/repo'
import type { EntryType } from './db/types'
import { useI18n, type T } from './i18n'
import type { MessageKey } from './i18n/en'
import { OfflineBar, PwaBanners } from './pwa/PwaBits'
import { Today, TodayKolam } from './screens/Today'

const Lists = lazy(() => import('./screens/Lists').then((m) => ({ default: m.Lists })))
const Notes = lazy(() => import('./screens/Lists').then((m) => ({ default: m.Notes })))
const Tasks = lazy(() => import('./screens/Lists').then((m) => ({ default: m.Tasks })))
const Journal = lazy(() => import('./screens/Journal').then((m) => ({ default: m.Journal })))

const EntryEditor = lazy(() => import('./screens/EntryEditor').then((m) => ({ default: m.EntryEditor })))
const Search = lazy(() => import('./screens/Search').then((m) => ({ default: m.Search })))
const Trash = lazy(() => import('./screens/Search').then((m) => ({ default: m.Trash })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))

const TABS: { name: Route['name']; key: MessageKey; Icon: typeof StickyNote }[] = [
  { name: 'today', key: 'nav.today', Icon: CalendarDays },
  { name: 'notes', key: 'nav.notes', Icon: StickyNote },
  { name: 'tasks', key: 'nav.tasks', Icon: CheckSquare },
  { name: 'lists', key: 'nav.lists', Icon: ListChecks },
  { name: 'journal', key: 'nav.journal', Icon: BookOpen },
  { name: 'settings', key: 'nav.settings', Icon: SettingsIcon },
]

function titleFor(route: Route, t: T, date: string, fmt: ReturnType<typeof useI18n>['fmt']) {
  if (route.name === 'today') {
    const d = fromISODate(date)
    return {
      title: date === toISODate() ? t('today.title') : fmt.date(d, { weekday: 'long' }),
      sub: fmt.date(d, { weekday: date === toISODate() ? 'long' : undefined, day: 'numeric', month: 'long', year: 'numeric' }),
    }
  }
  const key: Partial<Record<Route['name'], MessageKey>> = {
    notes: 'nav.notes',
    tasks: 'nav.tasks',
    lists: 'nav.lists',
    journal: 'nav.journal',
    search: 'nav.search',
    settings: 'nav.settings',
    trash: 'nav.trash',
  }
  return { title: key[route.name] ? t(key[route.name]!) : '', sub: '' }
}

function Compose() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function create(type: EntryType) {
    setOpen(false)
    const e = await repo.create({ type })
    navigate({ name: 'entry', id: e.id })
  }

  const items: { type: EntryType; key: MessageKey; Icon: typeof StickyNote }[] = [
    { type: 'note', key: 'new.note', Icon: StickyNote },
    { type: 'task', key: 'new.task', Icon: CheckSquare },
    { type: 'checklist', key: 'new.checklist', Icon: ListChecks },
  ]
  return (
    <>
      {open && (
        <ul className="compose-menu" ref={menuRef} id="compose-menu">
          {items.map(({ type, key, Icon }) => (
            <li key={type}>
              <button type="button" onClick={() => void create(type)}>
                <Icon size={20} aria-hidden />
                {t(key)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <IconButton
        label={t('new.title')}
        variant="default"
        className="fab"
        aria-expanded={open}
        aria-controls={open ? 'compose-menu' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus className="size-7" aria-hidden />
      </IconButton>
    </>
  )
}

export default function App() {
  const { t, fmt } = useI18n()
  const route = useRoute()
  const date = route.name === 'today' ? (route.date ?? toISODate()) : toISODate()
  const { title, sub } = titleFor(route, t, date, fmt)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    document.title = title ? `${title} · Journa` : 'Journa'
    window.scrollTo(0, 0)
  }, [route.name, title])

  const active = route.name === 'entry' || route.name === 'trash' || route.name === 'search' ? null : route.name

  return (
    <div className="shell">
      <a className="skip" href="#main">
        {t('app.skip')}
      </a>
      <header>
        <OfflineBar />
        <div className="topbar">
          <div className="topbar-row">
            <a className="brand" href={href({ name: 'today' })}>
              <NotebookPen size={16} aria-hidden />
              {t('app.name')}
            </a>
            <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
              <IconButton label={t('nav.search')} href={href({ name: 'search' })} className="on-kaavi">
                <SearchIcon aria-hidden />
              </IconButton>
              <BackupChip />
            </div>
          </div>
          {title && (
            <div className="topbar-row" style={{ display: 'block', marginTop: 'var(--s2)' }}>
              <h1 className="page-title">{title}</h1>
              {sub && <p className="page-sub">{sub}</p>}
            </div>
          )}
        </div>
        {route.name === 'today' && <TodayKolam date={date} />}
      </header>

      <nav className="tabs" aria-label={t('nav.main')}>
        {TABS.map(({ name, key, Icon }) => (
          <a key={name} className="tab" href={href({ name } as Route)} aria-current={active === name ? 'page' : undefined}>
            <Icon size={22} aria-hidden />
            {t(key)}
          </a>
        ))}
      </nav>

      <main className="main" id="main" ref={mainRef} tabIndex={-1}>
        <PwaBanners />
        <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
          {route.name === 'today' && <Today date={date} />}
          {route.name === 'notes' && <Notes tag={route.tag} />}
          {route.name === 'tasks' && <Tasks />}
          {route.name === 'lists' && <Lists />}
          {route.name === 'journal' && <Journal />}
          {route.name === 'search' && <Search />}
          {route.name === 'settings' && <Settings />}
          {route.name === 'trash' && <Trash />}
          {route.name === 'entry' && <EntryEditor id={route.id} />}
        </Suspense>
      </main>

      {route.name !== 'entry' && route.name !== 'settings' && <Compose />}
      <Toasts />
    </div>
  )
}
