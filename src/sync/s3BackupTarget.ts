import type { BackupTarget, TargetStatus } from '../backup/targets/BackupTarget'
import { BACKUP_FILE_RE } from '../backup/targets/folderTarget'

export interface CloudBackupDeps {
  apiBaseUrl: string
  getAccessToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

interface PresignResponse {
  uploadUrl: string
  uploadMethod?: string
}

interface ListResponse {
  backups: string[]
}

export function createCloudBackupTarget(deps: CloudBackupDeps): BackupTarget {
  const call = deps.fetchImpl ?? fetch
  const baseUrl = deps.apiBaseUrl.replace(/\/$/, '')

  async function authorized(path: string, init?: RequestInit): Promise<Response> {
    const token = await deps.getAccessToken()
    if (!token) throw new Error('cloud-backup-sign-in-required')
    const response = await call(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${token}`,
      },
    })
    if (!response.ok) throw new Error(`cloud-backup-http-${response.status}`)
    return response
  }

  return {
    id: 'cloud',

    async label() {
      return baseUrl || null
    },

    async status(): Promise<TargetStatus> {
      if (!baseUrl) return 'not-configured'
      if (typeof window === 'undefined' || typeof window.fetch !== 'function') return 'unavailable'
      return 'ready'
    },

    async requestPermission() {
      if (!baseUrl) return false
      return (await deps.getAccessToken()) !== null
    },

    async write(fileName, contents) {
      const presign = await authorized('/v1/backups/presign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: fileName }),
      })
      const { uploadUrl, uploadMethod } = (await presign.json()) as PresignResponse
      const upload = await call(uploadUrl, {
        method: uploadMethod ?? 'PUT',
        headers: { 'content-type': 'application/json' },
        body: contents,
      })
      if (!upload.ok) throw new Error(`cloud-backup-upload-${upload.status}`)
    },

    async rotate(keep) {
      const listed = await authorized('/v1/backups', { method: 'GET' })
      const { backups } = (await listed.json()) as ListResponse
      const stale = oldestBeyondKeep(backups, keep)
      for (const name of stale) {
        await authorized(`/v1/backups/${encodeURIComponent(name)}`, { method: 'DELETE' })
      }
      return stale.length
    },
  }
}

export function oldestBeyondKeep(names: string[], keep: number): string[] {
  const k = Math.max(1, keep)
  const sorted = names.filter((name) => BACKUP_FILE_RE.test(name)).sort()
  return sorted.slice(0, Math.max(0, sorted.length - k))
}
