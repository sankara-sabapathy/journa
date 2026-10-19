import { Bold, Code, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import type { RefObject } from 'react'
import { useI18n } from '../i18n'
import { applyMarkdownFormat, type MarkdownFormat } from './formatText'
import { IconButton } from './IconButton'

const BUTTONS: { kind: MarkdownFormat; Icon: typeof Bold }[] = [
  { kind: 'bold', Icon: Bold },
  { kind: 'italic', Icon: Italic },
  { kind: 'strike', Icon: Strikethrough },
  { kind: 'heading', Icon: Heading2 },
  { kind: 'quote', Icon: Quote },
  { kind: 'bullet', Icon: List },
  { kind: 'ordered', Icon: ListOrdered },
  { kind: 'code', Icon: Code },
]

/** Formatting toolbar for Markdown textareas. Storage stays Markdown; the buttons just write the syntax. */
export function MarkdownToolbar({
  target,
  onChange,
}: {
  target: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
}) {
  const { t } = useI18n()

  function apply(kind: MarkdownFormat) {
    const el = target.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const next = applyMarkdownFormat(value.slice(0, s), value.slice(s, e), value.slice(e), kind)
    onChange(next.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.selectStart, next.selectEnd)
    })
  }

  return (
    <div className="format-bar" role="toolbar" aria-label={t('format.toolbar')}>
      {BUTTONS.map(({ kind, Icon }) => (
        <IconButton key={kind} label={t(`format.${kind}`)} size="icon-lg" onClick={() => apply(kind)}>
          <Icon aria-hidden />
        </IconButton>
      ))}
    </div>
  )
}
