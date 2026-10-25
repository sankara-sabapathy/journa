import { db } from '../../db/db'
import type { BackupTarget, TargetStatus } from './BackupTarget'

/**
 * Writes backups into a folder the user picks with the File System Access API.
 * Picking a folder inside a Google Drive / OneDrive / Dropbox sync folder makes
 * the desktop sync client upload every backup. Chromium desktop only.
 */

const HANDLE_KEY = 'backup.folderHandle'
export const BACKUP_FILE_RE = /^journa-backup-\d{8}-\d{6}\.(json|jbak)$/

type PermissionMode = { mode: 'readwrite' }
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(d: PermissionMode): Promise<PermissionState>
  requestPermission(d: PermissionMode): Promise<PermissionState>
  values(): AsyncIterable<FileSystemHandle>
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>
  }
}

export function folderBackupSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

async function loadHandle(): Promise<DirHandle | undefined> {
  const row = await db.settings.get(HANDLE_KEY)
  return row?.value as DirHandle | undefined
}

/** Opens the folder picker and remembers the chosen folder. Call from a user gesture. */
export async function chooseBackupFolder(): Promise<string | null> {
  if (!window.showDirectoryPicker) return null
  try {
    const handle = await window.showDirectoryPicker({ id: 'journa-backups', mode: 'readwrite', startIn: 'documents' })
    await db.settings.put({ key: HANDLE_KEY, value: handle })
    return handle.name
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return null
    throw err
  }
}

export async function forgetBackupFolder(): Promise<void> {
  await db.settings.delete(HANDLE_KEY)
}

export const folderTarget: BackupTarget = {
  id: 'folder',

  async label() {
    return (await loadHandle())?.name ?? null
  },

  async status(): Promise<TargetStatus> {
    if (!folderBackupSupported()) return 'unavailable'
    const h = await loadHandle()
    if (!h) return 'not-configured'
    const p = await h.queryPermission({ mode: 'readwrite' })
    return p === 'granted' ? 'ready' : 'needs-permission'
  },

  async requestPermission() {
    const h = await loadHandle()
    if (!h) return false
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  },

  async write(fileName, contents) {
    const h = await loadHandle()
    if (!h) throw new Error('No backup folder')
    const file = await h.getFileHandle(fileName, { create: true })
    const w = await file.createWritable()
    await w.write(contents)
    await w.close()
  },

  async rotate(keep) {
    const h = await loadHandle()
    if (!h) return 0
    const names: string[] = []
    for await (const entry of h.values()) {
      if (entry.kind === 'file' && BACKUP_FILE_RE.test(entry.name)) names.push(entry.name)
    }
    const stale = filesToDelete(names, keep)
    for (const name of stale) await h.removeEntry(name)
    return stale.length
  },
}

/** Backup names sort chronologically, so everything before the newest `keep` goes. */
export function filesToDelete(names: string[], keep: number): string[] {
  const k = Math.max(1, keep)
  const sorted = names.filter((n) => BACKUP_FILE_RE.test(n)).sort()
  return sorted.slice(0, Math.max(0, sorted.length - k))
}
