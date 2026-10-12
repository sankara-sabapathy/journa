export type Vars = Record<string, string | number>

/**
 * Minimal ICU subset: `{name}` and `{name, plural, one {...} other {...}}` with `#`.
 * Enough for Journa's strings without shipping a full ICU runtime.
 */
export function formatMessage(template: string, vars: Vars = {}, locale = 'en'): string {
  let out = ''
  let i = 0
  while (i < template.length) {
    const ch = template[i]
    if (ch !== '{') {
      out += ch
      i++
      continue
    }
    const end = matchBrace(template, i)
    const inner = template.slice(i + 1, end)
    out += formatArg(inner, vars, locale)
    i = end + 1
  }
  return out
}

function matchBrace(s: string, start: number): number {
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  throw new Error(`Unbalanced braces in message: ${s}`)
}

function formatArg(inner: string, vars: Vars, locale: string): string {
  const parts = inner.split(',')
  const name = parts[0].trim()
  const value = vars[name]
  if (parts.length === 1) return value === undefined ? `{${name}}` : formatValue(value, locale)
  if (parts[1].trim() !== 'plural') return `{${inner}}`
  const options = parseOptions(parts.slice(2).join(','))
  const n = Number(value ?? 0)
  const exact = options[`=${n}`]
  const cat = new Intl.PluralRules(locale).select(n)
  const chosen = exact ?? options[cat] ?? options.other ?? ''
  return formatMessage(chosen, vars, locale).replace(/#/g, formatValue(n, locale))
}

function parseOptions(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < s.length) {
    const open = s.indexOf('{', i)
    if (open === -1) break
    const key = s.slice(i, open).trim()
    const close = matchBrace(s, open)
    out[key] = s.slice(open + 1, close)
    i = close + 1
  }
  return out
}

function formatValue(v: string | number, locale: string): string {
  return typeof v === 'number' ? new Intl.NumberFormat(locale).format(v) : v
}
