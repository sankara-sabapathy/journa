import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowLeft, ArrowUp, Pin, PinOff, Plus, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { navigate } from '../app/router'
import { toast } from '../app/toasts'
import { newId, repo } from '../db/repo'
import type { ChecklistItem, Entry, Priority } from '../db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconButton } from '../components/IconButton'
import { ProgressKolam } from '../components/ProgressKolam'
import { TaskCheck } from '../components/TaskCheck'
import { Segmented } from '../components/Segmented'
import { TagInput } from '../components/TagInput'
import { useI18n } from '../i18n'

const Markdown = lazy(() => import('../components/Markdown'))

/** Saves a field shortly after the last keystroke, and on unmount. */
function useAutosave(id: string) {
  const patch = useRef<Partial<Entry>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flush = () => {
    const p = patch.current
    patch.current = {}
    return Object.keys(p).length ? repo.update(id, p) : Promise.resolve()
  }
  useEffect(
    () => () => {
      void flush().then(() => {
        // Only once the user has left this entry (StrictMode re-mounts in place).
        if (!location.hash.includes(id)) void repo.discardIfEmpty(id)
      })
    },
    [id], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (p: Partial<Entry>, immediate = false) => {
    patch.current = { ...patch.current, ...p }
    clearTimeout(timer.current)
    if (immediate) void flush()
    else timer.current = setTimeout(flush, 400)
  }
}

export function EntryEditor({ id }: { id: string }) {
  const result = useLiveQuery(async () => ({ e: await repo.get(id) }), [id])
  const { t } = useI18n()
  if (!result) return <p className="muted">{t('common.loading')}</p>
  if (!result.e || result.e.deletedAt) {
    return (
      <p className="muted">
        <a href="#/today">{t('entry.back')}</a>
      </p>
    )
  }
  return <Editor key={id} initial={result.e} />
}

function Editor({ initial }: { initial: Entry }) {
  const { t } = useI18n()
  const save = useAutosave(initial.id)
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [tags, setTags] = useState(initial.tags)
  const [pinned, setPinned] = useState(initial.pinned)
  const [due, setDue] = useState(initial.due ?? '')
  const [priority, setPriority] = useState<Priority | 0>(initial.priority ?? 0)
  const [done, setDone] = useState(Boolean(initial.done))
  const [items, setItems] = useState<ChecklistItem[]>(initial.items ?? [])
  const [preview, setPreview] = useState(false)
  const [newItem, setNewItem] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!initial.title && !initial.body) titleRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setItemsAndSave = (next: ChecklistItem[]) => {
    setItems(next)
    save({ items: next }, true)
  }

  async function remove() {
    save({}, true)
    await repo.trash(initial.id)
    history.back()
    toast(t('trash.moved'), { label: t('trash.undo'), run: () => void repo.restore(initial.id) })
  }

  const doneCount = items.filter((i) => i.done).length

  return (
    <article className="editor">
      <div className="editor-bar">
        <Button variant="ghost" size="lg" onClick={() => (history.length > 1 ? history.back() : navigate({ name: 'today' }))}>
          <ArrowLeft aria-hidden />
          {t('entry.back')}
        </Button>
        <div className="btn-row">
          <IconButton
            label={pinned ? t('entry.unpin') : t('entry.pin')}
            onClick={() => {
              const p = pinned ? 0 : 1
              setPinned(p)
              save({ pinned: p }, true)
            }}
          >
            {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          </IconButton>
          <IconButton label={t('entry.delete')} onClick={() => void remove()}>
            <Trash2 aria-hidden />
          </IconButton>
        </div>
      </div>

      <div className="field">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          {initial.type === 'task' && (
            <TaskCheck
              className="m-0"
              checked={done}
              onChange={(v) => {
                setDone(v)
                save({ done: v }, true)
              }}
              label={t(done ? 'task.markOpen' : 'task.markDone', { title: title || t('entry.untitled') })}
            />
          )}
          <input
            id="title"
            ref={titleRef}
            className="title-input"
            aria-label={t('entry.title')}
            value={title}
            placeholder={t('entry.titlePlaceholder')}
            onChange={(e) => {
              setTitle(e.target.value)
              save({ title: e.target.value })
            }}
            enterKeyHint="next"
          />
        </div>
      </div>

      {initial.type === 'task' && (
        <div className="meta-grid">
          <div className="field">
            <label htmlFor="due">{t('task.due')}</label>
            <input
              id="due"
              type="date"
              className="input"
              value={due}
              onChange={(e) => {
                setDue(e.target.value)
                save({ due: e.target.value || undefined }, true)
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="prio">{t('task.priority')}</label>
            <select
              id="prio"
              className="input"
              value={priority}
              onChange={(e) => {
                const v = Number(e.target.value) as Priority | 0
                setPriority(v)
                save({ priority: v || undefined }, true)
              }}
            >
              <option value={0}>{t('task.priority.none')}</option>
              <option value={1}>{t('task.priority.1')}</option>
              <option value={2}>{t('task.priority.2')}</option>
              <option value={3}>{t('task.priority.3')}</option>
            </select>
          </div>
        </div>
      )}

      {initial.type === 'checklist' && (
        <section aria-labelledby="items-h">
          <div className="section-head">
            <h2 id="items-h">{t('list.items')}</h2>
            <span className="list-progress">
              <ProgressKolam done={doneCount} total={items.length} />
              {t('list.progress', { done: doneCount, total: items.length })}
            </span>
          </div>
          <div className="panel">
            <ul className="rows items">
              {items.map((item, i) => (
                <li key={item.id} className={`row${item.done ? ' done' : ''}`}>
                  <TaskCheck
                    className="m-0"
                    checked={item.done}
                    label={item.text}
                    onChange={() => setItemsAndSave(items.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
                  />
                  <input
                    className="item-text"
                    value={item.text}
                    aria-label={item.text || t('list.items')}
                    onChange={(e) => {
                      const next = items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x))
                      setItems(next)
                      save({ items: next })
                    }}
                  />
                  <div className="item-actions">
                    <IconButton
                      size="icon-lg"
                      disabled={i === 0}
                      label={t('list.moveUp', { text: item.text })}
                      onClick={() => setItemsAndSave(swap(items, i, i - 1))}
                    >
                      <ArrowUp aria-hidden />
                    </IconButton>
                    <IconButton
                      size="icon-lg"
                      disabled={i === items.length - 1}
                      label={t('list.moveDown', { text: item.text })}
                      onClick={() => setItemsAndSave(swap(items, i, i + 1))}
                    >
                      <ArrowDown aria-hidden />
                    </IconButton>
                    <IconButton
                      size="icon-lg"
                      label={t('list.removeItem', { text: item.text })}
                      onClick={() => setItemsAndSave(items.filter((x) => x.id !== item.id))}
                    >
                      <X aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="add-item"
              onSubmit={(e) => {
                e.preventDefault()
                const text = newItem.trim()
                if (!text) return
                setItemsAndSave([...items, { id: newId(), text, done: false }])
                setNewItem('')
              }}
            >
              <Input
                id="new-item"
                size="lg"
                aria-label={t('list.addItem')}
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder={t('list.addItemPlaceholder')}
                enterKeyHint="enter"
              />
              <Button type="submit" size="lg">
                <Plus aria-hidden />
                {t('common.add')}
              </Button>
            </form>
          </div>
        </section>
      )}

      <div className="field">
        <div className="editor-bar">
          <label htmlFor="body" className="label">
            {t('entry.body')}
          </label>
          <Segmented
            label={t('entry.body')}
            value={preview ? 'preview' : 'edit'}
            onChange={(v) => setPreview(v === 'preview')}
            className="w-auto"
            options={[
              { value: 'edit', label: t('entry.edit') },
              { value: 'preview', label: t('entry.preview') },
            ]}
          />
        </div>
        {preview ? (
          <div className="panel" style={{ padding: 'var(--s4)', minHeight: '20vh' }}>
            <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
              <Markdown source={body} />
            </Suspense>
          </div>
        ) : (
          <textarea
            id="body"
            className="body-input"
            value={body}
            placeholder={t('entry.bodyPlaceholder')}
            style={initial.type === 'note' ? undefined : { minHeight: '20vh' }}
            onChange={(e) => {
              setBody(e.target.value)
              save({ body: e.target.value })
            }}
          />
        )}
      </div>

      <TagInput
        tags={tags}
        onChange={(next) => {
          setTags(next)
          save({ tags: next }, true)
        }}
      />
    </article>
  )
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
