import { db } from '../db/db'
import { onChange } from '../db/repo'
import type { ErrorCode } from '../app/errors'

import type { BackupTarget, TargetStatus } from './targets/BackupTarget'

/**
 * Automatic backups while the app is open: shortly after edits, hourly,
 * and when the tab is hidden. The web can't reliably run when the app is closed.
 */

export interface BackupSettings {
  enabled: boolean
  keep: number
  /**
   * Optional. Kept on this device only; it encrypts the copies that leave it
   * (the files in the synced folder), so the drive provider can't read them.
   */
  passphrase: string
}

export interface BackupState {
  status: TargetStatus
  folder: string | null
  lastBackupAt: number | null
  lastError: ErrorCode | null
  running: boolean
  dirty: boolean
}

export const DEFAULT_SETTINGS: BackupSettings = { enabled: true, keep: 20, passphrase: '' }
const SETTINGS_KEY = 'backup.settings'
const LAST_KEY = 'backup.lastAt'
export const DEBOUNCE_MS = 30_000
export const INTERVAL_MS = 60 * 60_000

export async function getBackupSettings(): Promise<BackupSettings> {
  const row = await db.settings.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<BackupSettings> | undefined) }
}

export async function saveBackupSettings(patch: Partial<BackupSettings>): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value: { ...(await getBackupSettings()), ...patch } })
  await scheduler.refresh()
}

function createScheduler() {
  let target: BackupTarget | null = null
  let state: BackupState = {
    status: 'not-configured',
    folder: null,
    lastBackupAt: null,
    lastError: null,
    running: false,
    dirty: false,
  }
  const subs = new Set<() => void>()
  let debounce: ReturnType<typeof setTimeout> | undefined
  let interval: ReturnType<typeof setInterval> | undefined

  function set(patch: Partial<BackupState>) {
    state = { ...state, ...patch }
    for (const fn of subs) fn()
  }

  async function runNow(): Promise<boolean> {
    if (!target || state.running) return false
    const settings = await getBackupSettings()
    const status = await target.status()
    set({ status })
    if (status !== 'ready') return false
    set({ running: true })
    try {
      const encrypted = settings.passphrase !== ''
      const { backupFileName, backupFileText } = await import('./exportImport')
      const text = await backupFileText(settings.passphrase || undefined)
      await target.write(backupFileName(new Date(), encrypted ? 'jbak' : 'json'), text)
      await target.rotate(settings.keep)
      const now = Date.now()
      await db.settings.put({ key: LAST_KEY, value: now })
      set({ lastBackupAt: now, lastError: null, dirty: false })
      return true
    } catch {
      set({ lastError: 'error.backupFailed' })
      return false
    } finally {
      set({ running: false })
    }
  }

  async function maybeRun() {
    const settings = await getBackupSettings()
    if (settings.enabled && state.dirty) await runNow()
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') void maybeRun()
  }

  return {
    getState: () => state,
    subscribe(fn: () => void) {
      subs.add(fn)
      return () => subs.delete(fn)
    },

    async start(t: BackupTarget) {
      target = t
      const last = (await db.settings.get(LAST_KEY))?.value as number | undefined
      set({ lastBackupAt: last ?? null })
      await this.refresh()
      onChange(() => {
        set({ dirty: true })
        clearTimeout(debounce)
        debounce = setTimeout(() => void maybeRun(), DEBOUNCE_MS)
      })
      interval = setInterval(() => void maybeRun(), INTERVAL_MS)
      document.addEventListener('visibilitychange', onVisibility)
    },

    stop() {
      clearTimeout(debounce)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    },

    async refresh() {
      if (!target) return
      set({ status: await target.status(), folder: await target.label() })
    },

    /** Back up immediately (e.g. the "Back up now" button). */
    runNow,

    /** Re-grant folder access; must run inside a user gesture. */
    async reconnect() {
      if (!target) return false
      const ok = await target.requestPermission()
      await this.refresh()
      if (ok) await runNow()
      return ok
    },
  }
}

export const scheduler = createScheduler()
