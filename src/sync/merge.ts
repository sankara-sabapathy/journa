import type { Entry } from '../db/types'
import type { SyncConflict, SyncConflictReason, SyncItem } from './types'

/**
 * Last-write-wins selection used to apply pulled changes after the server returns.
 * Returns every incoming entry whose `updatedAt` is strictly newer than the local
 * one (or was missing locally). Equal timestamps are broken deterministically by
 * journal type, then by lexicographic title/body order, so two devices that
 * edited the exact same instant still converge to the same result.
 */
export function selectWinningEntries(localById: ReadonlyMap<string, Entry>, incoming: readonly Entry[]): Entry[] {
  const winners: Entry[] = []

  for (const remote of incoming) {
    const local = localById.get(remote.id)
    if (!local) {
      winners.push(remote)
      continue
    }

    if (remote.updatedAt !== local.updatedAt) {
      if (remote.updatedAt > local.updatedAt) winners.push(remote)
      continue
    }

    // Equal timestamp: prefer a soft-deleted current state? Prefer non-journal conflicts resolved by text.
    if (remote.deletedAt !== local.deletedAt) {
      if (remote.deletedAt > local.deletedAt) winners.push(remote)
      continue
    }

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

/**
 * Returns entries that both sides changed close together, so the UI can prompt
 * before applying anything. These are intentionally conservative: once a merge
 * prompt has been answered, the engine calls `selectWinningEntries`.
 */
export function detectSyncConflicts(
  localById: ReadonlyMap<string, SyncItem>,
  incoming: readonly SyncItem[],
  windowMs = 60_000,
): SyncConflict[] {
  const conflicts: SyncConflict[] = []

  for (const remote of incoming) {
    const local = localById.get(remote.id)
    if (!local) continue

    const reason = conflictReason(local, remote)
    if (reason === null) continue

    const timeDelta = Math.abs(remote.updatedAt - local.updatedAt)
    if (timeDelta > windowMs && reason !== 'edit-after-delete') continue
    conflicts.push({ id: remote.id, reason, local, incoming: remote })
  }

  return conflicts
}

function conflictReason(local: SyncItem, incoming: SyncItem): SyncConflictReason | null {
  const localEntry = syncItemEntry(local)
  const remoteEntry = syncItemEntry(incoming)
  const deletedStateDiffers = local.deletedAt !== incoming.deletedAt

  if (localEntry && remoteEntry) {
    if (deletedStateDiffers) return 'edit-after-delete'
    const textChanged = localEntry.title !== remoteEntry.title || localEntry.body !== remoteEntry.body
    if (textChanged && local.updatedAt > 0 && incoming.updatedAt > 0) return 'concurrent-edit'
    return null
  }

  // Encrypted payloads: fall back to metadata-only signals.
  if (deletedStateDiffers) return 'edit-after-delete'
  if (local.updatedAt === incoming.updatedAt && local.updatedAt > 0) return 'same-update'
  return null
}

export function syncItemsById(items: readonly SyncItem[]): Map<string, SyncItem> {
  const byId = new Map<string, SyncItem>()
  for (const item of items) byId.set(item.id, item)
  return byId
}

// Keep the architecture-sketch alias explicit for callers expecting LWW only.
export const mergeWinners = selectWinningEntries