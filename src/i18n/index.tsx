import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type MessageKey, type Messages } from './en'
import { formatMessage, type Vars } from './format'
import { hi } from './hi'
import { ta } from './ta'

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' },
] as const

export type Locale = (typeof LOCALES)[number]['code']

export const catalogs: Record<Locale, Messages> = { en, ta, hi }

const STORAGE_KEY = 'journa.locale'

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in catalogs) return saved as Locale
  } catch {
    /* storage blocked */
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const base = lang.slice(0, 2).toLowerCase()
    if (base in catalogs) return base as Locale
  }
  return 'en'
}

export type T = (key: MessageKey, vars?: Vars) => string

interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: T
  /** Intl-aware formatters bound to the current locale. */
  fmt: {
    date: (d: Date | number, opts?: Intl.DateTimeFormatOptions) => string
    relative: (ms: number) => string
    bytes: (n: number) => string
  }
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* storage blocked */
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const messages = catalogs[locale]
    const t: T = (key, vars) => formatMessage(messages[key] ?? en[key], vars, locale)
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    return {
      locale,
      setLocale,
      t,
      fmt: {
        date: (d, opts) => new Intl.DateTimeFormat(locale, opts).format(d),
        relative: (ms) => relativeTime(rtf, ms),
        bytes: (n) =>
          new Intl.NumberFormat(locale, { style: 'unit', unit: n > 1e6 ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(
            n > 1e6 ? n / 1e6 : n / 1e3,
          ),
      },
    }
  }, [locale, setLocale])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}

/** "3 minutes ago", "yesterday"… from a past timestamp. */
export function relativeTime(rtf: Intl.RelativeTimeFormat, ms: number, now = Date.now()): string {
  const diff = (ms - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}
