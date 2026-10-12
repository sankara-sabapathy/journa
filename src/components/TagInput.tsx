import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { useI18n } from '../i18n'
import { IconButton } from './IconButton'

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n()
  const id = useId()
  const [draft, setDraft] = useState('')

  function commit() {
    const tag = draft.trim().replace(/^#/, '')
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setDraft('')
  }

  return (
    <div className="field">
      <label htmlFor={id}>{t('entry.tags')}</label>
      <div className="tag-input">
        {tags.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <IconButton size="icon-sm" label={t('entry.removeTag', { tag })} onClick={() => onChange(tags.filter((x) => x !== tag))}>
              <X aria-hidden />
            </IconButton>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && !draft && tags.length) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={commit}
          enterKeyHint="done"
          aria-describedby={`${id}-hint`}
        />
      </div>
      <span className="hint" id={`${id}-hint`}>
        {t('entry.tagsHint')}
      </span>
    </div>
  )
}
