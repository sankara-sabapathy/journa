export type MarkdownFormat = 'bold' | 'italic' | 'strike' | 'heading' | 'quote' | 'bullet' | 'ordered' | 'code'

export interface FormattedText {
  text: string
  selectStart: number
  selectEnd: number
}

const INLINE: Record<string, { open: string; close: string }> = {
  bold: { open: '**', close: '**' },
  italic: { open: '*', close: '*' },
  strike: { open: '~~', close: '~~' },
  code: { open: '`', close: '`' },
}

function applyInline(before: string, selected: string, after: string, kind: string): FormattedText {
  const { open, close } = INLINE[kind]
  if (selected.length > 0) {
    const unopen = open.length
    const unclose = close.length
    if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= unopen + unclose) {
      const inner = selected.slice(unopen, selected.length - unclose)
      return { text: before + inner + after, selectStart: before.length, selectEnd: before.length + inner.length }
    }
    const text = before + open + selected + close + after
    return { text, selectStart: before.length + unopen, selectEnd: before.length + unopen + selected.length }
  }
  const text = before + open + close + after
  const pos = before.length + open.length
  return { text, selectStart: pos, selectEnd: pos }
}

function applyLinePrefix(before: string, selected: string, after: string, prefix: string | null, ordered: boolean): FormattedText {
  const start = before.lastIndexOf('\n') + 1
  const endIdx = after.indexOf('\n')
  const end = endIdx === -1 ? before.length + selected.length + after.length : before.length + selected.length + endIdx
  const full = before + selected + after
  const block = full.slice(start, end)
  const lines = block.split('\n')
  const stripped = lines.map((l) => stripPrefix(l, ordered))
  const already = stripped.every((_, i) => lines[i] !== stripped[i]) && lines.length > 0
  const next = already ? stripped : lines.map((l) => addPrefix(l, prefix, ordered))
  const text = full.slice(0, start) + next.join('\n') + full.slice(end)
  return { text, selectStart: start, selectEnd: start + next.join('\n').length }
}

function stripPrefix(line: string, ordered: boolean): string {
  if (ordered) return line.replace(/^(\s*)\d+\.\s/, '$1')
  return line.replace(/^(\s*)(## |>\s?|-\s)/, '$1')
}

function addPrefix(line: string, prefix: string | null, ordered: boolean): string {
  if (line.trim() === '') return line
  if (ordered) {
    const m = line.match(/^(\s*)/)
    return `${m?.[1] ?? ''}1. ${line.trimStart()}`
  }
  return `${prefix}${line}`
}

/**
 * Pure text transform for the formatting toolbar. Storage stays Markdown;
 * this only helps people who never learned the syntax.
 */
export function applyMarkdownFormat(before: string, selected: string, after: string, kind: MarkdownFormat): FormattedText {
  switch (kind) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'code':
      return applyInline(before, selected, after, kind)
    case 'heading':
      return applyLinePrefix(before, selected, after, '## ', false)
    case 'quote':
      return applyLinePrefix(before, selected, after, '> ', false)
    case 'bullet':
      return applyLinePrefix(before, selected, after, '- ', false)
    case 'ordered':
      return applyLinePrefix(before, selected, after, null, true)
  }
}
