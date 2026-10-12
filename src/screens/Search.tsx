import { useLiveQuery } from 'dexie-react-hooks'
import { RotateCcw, Search as SearchIcon } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '../app/toasts'
import { repo } from '../db/repo'
import { EntryRow, Empty, useEntryTitle } from '../components/EntryRows'
import { useI18n } from '../i18n'

export function Search() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const results = useLiveQuery(() => repo.search(query), [query]) ?? []
  return (
    <div>
      <div className="search-box">
        <SearchIcon size={20} aria-hidden />
        <Input
          id="q"
          size="lg"
          aria-label={t('search.label')}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder')}
          autoFocus
          enterKeyHint="search"
        />
      </div>
      <div className="section">
        {!query.trim() ? (
          <Empty>{t('search.hint')}</Empty>
        ) : results.length ? (
          <>
            <p className="muted" aria-live="polite" style={{ marginBottom: 'var(--s2)' }}>
              {t('search.results', { count: results.length })}
            </p>
            <ul className="rows panel">
              {results.map((e) => (
                <EntryRow key={e.id} e={e} showType />
              ))}
            </ul>
          </>
        ) : (
          <Empty>{t('search.empty', { query })}</Empty>
        )}
      </div>
    </div>
  )
}

export function Trash() {
  const { t, fmt } = useI18n()
  const title = useEntryTitle()
  const rows = useLiveQuery(() => repo.listTrash(), []) ?? []
  return (
    <div>
      {rows.length > 0 && (
        <div className="btn-row" style={{ marginBottom: 'var(--s3)' }}>
          <Button
            size="lg"
            variant="destructive-outline"
            onClick={async () => {
              if (confirm(t('trash.confirm', { count: rows.length }))) await repo.emptyTrash()
            }}
          >
            {t('trash.emptyAll')}
          </Button>
        </div>
      )}
      {rows.length ? (
        <ul className="rows panel">
          {rows.map((e) => (
            <li className="row" key={e.id}>
              <div className="row-main">
                <span className="row-title">{title(e)}</span>
                <span className="row-meta">
                  <span>{t(`type.${e.type}`)}</span>
                  <span>{t('trash.deletedOn', { time: fmt.relative(e.deletedAt) })}</span>
                </span>
              </div>
              <Button
                size="lg"
                variant="ghost"
                onClick={async () => {
                  await repo.restore(e.id)
                  toast(t('trash.restore'))
                }}
              >
                <RotateCcw aria-hidden />
                {t('trash.restore')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('trash.empty')}</Empty>
      )}
    </div>
  )
}
