import type { Entry } from '../db/types'
import type { SyncConflict, SyncConflictReason, SyncItem } from './types'

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

    const remoteKey = `${remote.title}\0${remote.body}`
    const localKey = `${local.title}\0${local.body}`
    if (remoteKey > localKey) winners.push(remote)
  }

  return winners
}

function syncItemEntry(item: SyncItem): Entry | null {
  if (item.kind === 'plain') return item.entry
  return null
}

export function detectSyncConflicts(
  localById: ReadonlyMap<string, SyncItem>,
  incoming: readonly SyncItem[],
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

function classifyConflictReason(local: SyncItem, incoming: SyncItem): SyncConflictReason | null {
  const localEntry = syncItemEntry(local)
  const remoteEntry = syncItemEntry(incoming)
  const deletedStateDiffers = local.deletedAt !== incoming.deletedAt

  if (localEntry && remoteEntry) {
    if (deletedStateDiffers) return 'edit-after-delete'
    const textChanged = localEntry.title !== remoteEntry.title || localEntry.body !== remoteEntry.body
    if (textChanged) return 'concurrent-edit'
    return null
  }

  if (deletedStateDiffers) return 'edit-after-delete'
  if (local.updatedAt === incoming.updatedAt && local.updatedAt > 0) return 'same-update'
  return null
}

export function syncItemsById(items: readonly SyncItem[]): Map<string, SyncItem> {
  const byId = new Map<string, SyncItem>()
  for (const item of items) byId.set(item.id, item)
  return byId
}