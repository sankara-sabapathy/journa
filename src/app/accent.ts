import { useCallback, useState } from 'react'

export type AccentId = 'kaavi' | 'leaf' | 'indigo' | 'plum' | 'teal' | 'slate'

export interface Accent {
  id: AccentId
  kaavi: string
  deep: string
  ink: string
}

export const ACCENTS: Accent[] = [
  { id: 'kaavi', kaavi: '#8a3324', deep: '#6e2719', ink: '#8a3324' },
  { id: 'leaf', kaavi: '#2f6b4f', deep: '#234e3a', ink: '#2f6b4f' },
  { id: 'indigo', kaavi: '#3b4a8c', deep: '#2c3870', ink: '#3b4a8c' },
  { id: 'plum', kaavi: '#7a2f5e', deep: '#5e2349', ink: '#7a2f5e' },
  { id: 'teal', kaavi: '#1f6f6b', deep: '#175550', ink: '#1f6f6b' },
  { id: 'slate', kaavi: '#3f4750', deep: '#2e3339', ink: '#3f4750' },
]

const KEY = 'journa.accent'

export function readAccent(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && ACCENTS.some((a) => a.id === v)) return v
  } catch {
    /* storage blocked */
  }
  return 'kaavi'
}

export function applyAccent(id: string) {
  const root = document.documentElement
  const accent = ACCENTS.find((a) => a.id === id)
  if (!accent || accent.id === 'kaavi') {
    root.style.removeProperty('--kaavi')
    root.style.removeProperty('--kaavi-deep')
    root.style.removeProperty('--kaavi-ink')
  } else {
    root.style.setProperty('--kaavi', accent.kaavi)
    root.style.setProperty('--kaavi-deep', accent.deep)
    root.style.setProperty('--kaavi-ink', accent.ink)
  }
  const color = getComputedStyle(root).getPropertyValue('--kaavi').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

export function useAccent(): [string, (id: string) => void] {
  const [accent, setAccentState] = useState<string>(readAccent)
  const setAccent = useCallback((id: string) => {
    setAccentState(id)
    applyAccent(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* storage blocked */
    }
  }, [])
  return [accent, setAccent]
}
