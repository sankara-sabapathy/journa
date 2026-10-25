import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowLeft, ArrowUp, Pin, PinOff, Plus, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { href, navigate } from '../app/router'
import { toast } from '../app/toasts'
import { fromISODate } from '../db/date'
import { newId, repo } from '../db/repo'
import type { ChecklistItem, Entry, Mood, Priority } from '../db/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconButton } from '../components/IconButton'
import { MoodLabel, MoodPicker } from '../components/MoodPicker'
import { ProgressKolam } from '../components/ProgressKolam'
import { TaskCheck } from '../components/TaskCheck'
import { Segmented } from '../components/Segmented'
import { MarkdownToolbar } from '../components/MarkdownToolbar'
import { TagInput } from '../components/TagInput'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/en'

const Markdown = lazy(() => import('../components/Markdown'))

/** Saves a field shortly after the last keystroke, and on unmount. */
function useAutosave(id: string, onFlush?: () => void) {
  const patch = useRef<Partial<Entry>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const flush = () => {
    const p = patch.current
    patch.current = {}
    return (Object.keys(p).length ? repo.update(id, p) : Promise.resolve()).then(() => {
      if (Object.keys(p).length && mounted.current) onFlush?.()
    })
  }
  useEffect(
    () => () => {
      mounted.current = false
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
  const result = useLiveQuery(async () => ({ i: id, e: await repo.get(id) }), [id])
  const { t } = useI18n()
  if (!result || result.i !== id) return <p className="muted">{t('common.loading')}</p>
  if (!result.e || result.e.deletedAt) {
    return (
      <div className="empty not-found">
        <strong>{t('notFound.title')}</strong>
        <p>{t('entry.notFound')}</p>
        <a className="btn btn-primary" href={href({ name: 'today' })}>
          {t('notFound.home')}
        </a>
      </div>
    )
  }
  return <Editor key={id} initial={result.e} />
}

function Editor({ initial }: { initial: Entry }) {
  const { t, fmt } = useI18n()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const save = useAutosave(initial.id, () => setSavedAt(Date.now()))
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [tags, setTags] = useState(initial.tags)
  const [pinned, setPinned] = useState(initial.pinned)
  const [due, setDue] = useState(initial.due ?? '')
  const [priority, setPriority] = useState<Priority | 0>(initial.priority ?? 0)
  const [done, setDone] = useState(Boolean(initial.done))
  const [items, setItems] = useState<ChecklistItem[]>(initial.items ?? [])
  const [mood, setMood] = useState<Mood | null>(initial.mood ?? null)
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('edit')
  // New entries — and journals, which are written daily, not read — open ready to type.
  const [editing, setEditing] = useState(initial.type === 'journal' || (!initial.title && !initial.body && !(initial.items?.length)))
  const [newItem, setNewItem] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (initial.title || initial.body) return
    // Journals are titled by their date, so the writing area is what needs focus.
    if (initial.type === 'journal') bodyRef.current?.focus()
    else titleRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setItemsAndSave = (next: ChecklistItem[]) => {
    setItems(next)
    save({ items: next }, true)
  }

  async function remove() {
    save({}, true)
    await repo.trash(initial.id)
    if (history.length > 1) history.back()
    else navigate({ name: 'today' })
    toast(t('trash.moved'), { label: t('trash.undo'), run: () => void repo.restore(initial.id) })
  }

  const doneCount = items.filter((i) => i.done).length

  const viewTitle =
    title ||
    (initial.type === 'journal' && initial.date
      ? fmt.date(fromISODate(initial.date), { weekday: 'long', day: 'numeric', month: 'long' })
      : t('entry.untitled'))

  const editorBox = (
    <>
      <MarkdownToolbar
        target={bodyRef}
        onChange={(next) => {
          setBody(next)
          save({ body: next })
        }}
      />
      <textarea
        id="body"
        ref={bodyRef}
        className="body-input"
        value={body}
        placeholder={t('entry.bodyPlaceholder')}
        style={initial.type === 'note' ? undefined : { minHeight: '20vh' }}
        onChange={(e) => {
          setBody(e.target.value)
          save({ body: e.target.value })
        }}
      />
    </>
  )
  const previewBox = (
    <div className="panel" style={{ padding: 'var(--s4)', minHeight: '20vh' }}>
      <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
        <Markdown source={body} />
      </Suspense>
    </div>
  )

  return (
    <article className="editor">
      <div className="editor-bar">
        <Button variant="ghost" size="lg" onClick={() => (history.length > 1 ? history.back() : navigate({ name: 'today' }))}>
          <ArrowLeft aria-hidden />
          {t('entry.back')}
        </Button>
        <span className="muted whitespace-nowrap" aria-live="polite">
          {savedAt ? t('entry.edited', { time: fmt.date(savedAt, { hour: 'numeric', minute: '2-digit' }) }) : ''}
        </span>
        <div className="btn-row">
          {editing ? (
            <Button size="lg" variant="outline" onClick={() => setEditing(false)}>
              {t('entry.doneEditing')}
            </Button>
          ) : (
            <Button size="lg" variant="outline" onClick={() => setEditing(true)}>
              {t('entry.edit')}
            </Button>
          )}
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

      {editing ? (
        <>
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
          {initial.type === 'journal' ? (
            <h1 className="title-view">{viewTitle}</h1>
          ) : (
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
          )}
        </div>
      </div>

      {initial.type === 'journal' && (
        <div className="field mood-field">
          <MoodPicker
            mood={mood}
            onChange={(next) => {
              setMood(next)
              save({ mood: next ?? undefined }, true)
            }}
          />
        </div>
      )}

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
            value={mode}
            onChange={setMode}
            className="w-auto"
            options={[
              { value: 'edit', label: t('entry.edit') },
              { value: 'split', label: t('entry.split') },
              { value: 'preview', label: t('entry.preview') },
            ]}
          />
        </div>
        {mode === 'preview' ? (
          previewBox
        ) : mode === 'split' ? (
          <div className="split-pane">
            {editorBox}
            {previewBox}
          </div>
        ) : (
          editorBox
        )}
      </div>

      <TagInput
        tags={tags}
        onChange={(next) => {
          setTags(next)
          save({ tags: next }, true)
        }}
      />
        </>
      ) : (
        <>
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
              <h1 className="title-view">{viewTitle}</h1>
              {initial.type === 'journal' && <MoodLabel mood={mood} />}
            </div>
          </div>

          {initial.type === 'task' && (due || priority !== 0) && (
            <p className="muted">
              {due ? `${t('task.due')}: ${fmt.date(new Date(`${due}T00:00`), { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              {due && priority !== 0 ? ' · ' : ''}
              {priority !== 0 ? t(`task.priority.${priority}` as MessageKey) : ''}
            </p>
          )}

          {initial.type === 'checklist' && items.length > 0 && (
            <section aria-labelledby="items-h-view">
              <div className="section-head">
                <h2 id="items-h-view">{t('list.items')}</h2>
                <span className="list-progress">
                  <ProgressKolam done={doneCount} total={items.length} />
                  {t('list.progress', { done: doneCount, total: items.length })}
                </span>
              </div>
              <div className="panel">
                <ul className="rows items">
                  {items.map((item) => (
                    <li key={item.id} className={`row${item.done ? ' done' : ''}`}>
                      <TaskCheck
                        className="m-0"
                        checked={item.done}
                        label={item.text}
                        onChange={() => setItemsAndSave(items.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
                      />
                      <span className="item-text">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {body ? (
            <div className="panel" style={{ padding: 'var(--s4)' }}>
              <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
                <Markdown source={body} />
              </Suspense>
            </div>
          ) : null}

          {tags.length > 0 && (
            <div className="tag-input" aria-label={t('entry.tags')}>
              {tags.map((tag) => (
                <span className="tag" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  )
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
