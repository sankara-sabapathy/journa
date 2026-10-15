import { describe, expect, it, vi } from 'vitest'
import { createCloudBackupTarget, oldestBeyondKeep } from './s3BackupTarget'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('cloud backup target', () => {
  it('uploads through a presigned URL', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method })
      if (url.endsWith('/v1/backups/presign')) return jsonResponse({ uploadUrl: 'https://uploads.example/file', uploadMethod: 'PUT' })
      return new Response(null, { status: 200 })
    })
    const target = createCloudBackupTarget({
      apiBaseUrl: 'https://api.example',
      getAccessToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await target.write('journa-backup-20261015-120000.json', '{"app":"journa"}')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(calls[1]).toEqual({ url: 'https://uploads.example/file', method: 'PUT' })
  })

  it('rotates all but the newest backups', async () => {
    const deleted: string[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/v1/backups')) {
        return jsonResponse({
          backups: [
            'journa-backup-20261013-120000.json',
            'journa-backup-20261014-120000.json',
            'journa-backup-20261015-120000.json',
          ],
        })
      }
      if (init?.method === 'DELETE') deleted.push(url)
      return new Response(null, { status: 204 })
    })
    const target = createCloudBackupTarget({
      apiBaseUrl: 'https://api.example',
      getAccessToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    })

    const removed = await target.rotate(2)

    expect(removed).toBe(1)
    expect(deleted).toEqual(['https://api.example/v1/backups/journa-backup-20261013-120000.json'])
  })

  it('selects only timestamped backups beyond keep', () => {
    expect(oldestBeyondKeep(['b.txt', 'journa-backup-20261015-120000.json'], 5)).toEqual([])
  })
})
