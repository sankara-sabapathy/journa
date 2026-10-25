import type { Entry } from '../db/types'
import type { SyncConflict, SyncConflictReason } from './types'

export const SYNC_CONFLICT_WINDOW_MS = 60_000

export function selectWinningEntries(localById: ReadonlyMap<string, Entry>, incoming: readonly Entry[]): Entry[] {
  const winners: Entry[] = []

  for (const remote of incoming) {
    const local = localById.get(remote.id)
    if (!local) {
      winners.push(remote)
      continue
    }

    if (remote.updatedAt > local.updatedAt) {
      winners.push(remote)
      continue
    }
    if (remote.updatedAt < local.updatedAt) continue

    if (remote.deletedAt > local.deletedAt) {
      winners.push(remote)
      continue
    }
    if (remote.deletedAt < local.deletedAt) continue

    const remoteKey = `${remote.title}\0${remote.body}\0${remote.mood ?? ''}\0${(remote.tags ?? []).join(',')}\0${remote.pinned}\0${remote.done ?? ''}\0${JSON.stringify(remote.items ?? null)}`
    const localKey = `${local.title}\0${local.body}\0${local.mood ?? ''}\0${(local.tags ?? []).join(',')}\0${local.pinned}\0${local.done ?? ''}\0${JSON.stringify(local.items ?? null)}`
    if (remoteKey > localKey) winners.push(remote)
  }

  return winners
}

export function detectSyncConflicts(
  localById: ReadonlyMap<string, Entry>,
  incoming: readonly Entry[],
  windowMs: number = SYNC_CONFLICT_WINDOW_MS,
): SyncConflict[] {
  const conflicts: SyncConflict[] = []

  for (const remote of incoming) {
    const local = localById.get(remote.id)
    if (!local) continue

    const reason = classifyConflictReason(local, remote)
    if (reason === null) continue

    const timeDelta = Math.abs(remote.updatedAt - local.updatedAt)
    if (timeDelta > windowMs && reason !== 'edit-after-delete') continue
    conflicts.push({ id: remote.id, reason, local, incoming: remote })
  }

  return conflicts
}

function classifyConflictReason(local: Entry, incoming: Entry): SyncConflictReason | null {
  const deletedStateDiffers = local.deletedAt !== incoming.deletedAt

  if (deletedStateDiffers) return 'edit-after-delete'
  const contentChanged =
    local.title !== incoming.title ||
    local.body !== incoming.body ||
    local.mood !== incoming.mood ||
    JSON.stringify(local.tags) !== JSON.stringify(incoming.tags) ||
    local.pinned !== incoming.pinned ||
    local.done !== incoming.done ||
    JSON.stringify(local.items) !== JSON.stringify(incoming.items)
  if (contentChanged) return 'concurrent-edit'
  return null
}