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

    const remoteKey = `${remote.title}\0${remote.body}\0${remote.mood ?? ''}`
    const localKey = `${local.title}\0${local.body}\0${local.mood ?? ''}`
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
  const textChanged = local.title !== incoming.title || local.body !== incoming.body
  if (textChanged) return 'concurrent-edit'
  return null
}