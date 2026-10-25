import { describe, expect, it, vi, beforeEach } from 'vitest'

const dbSettings = new Map<string, unknown>()

vi.mock('../db/db', () => ({
  db: {
    settings: {
      get: async (key: string) => (dbSettings.has(key) ? { key, value: dbSettings.get(key) } : undefined),
      put: async (row: { key: string; value: unknown }) => dbSettings.set(row.key, row.value),
    },
  },
}))

const { hasAcknowledgedRecovery, acknowledgeRecovery } = await import('./devices')

describe('recovery acknowledgement', () => {
  beforeEach(() => dbSettings.clear())

  it('starts unacknowledged and records the ack', async () => {
    expect(await hasAcknowledgedRecovery()).toBe(false)
    await acknowledgeRecovery()
    expect(await hasAcknowledgedRecovery()).toBe(true)
  })
})
