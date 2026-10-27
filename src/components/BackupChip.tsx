import { CloudAlert, CloudCheck, CloudOff, CloudUpload } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { href } from '../app/router'
import { scheduler } from '../backup/scheduler'
import { useAccountState } from '../sync/engine'
import { useI18n } from '../i18n'

export function useBackupState() {
  return useSyncExternalStore(scheduler.subscribe, scheduler.getState)
}

export function BackupChip() {
  const { t, fmt } = useI18n()
  const s = useBackupState()
  const account = useAccountState()
  const signedIn = account.status === 'idle' || account.status === 'syncing'
  let tone: 'ok' | 'attention' = 'ok'
  let text: string
  let Icon = CloudCheck
  if (s.status === 'needs-permission' || s.lastError) {
    tone = 'attention'
    text = t('backup.chip.attention')
    Icon = CloudAlert
  } else if (s.status === 'ready' && s.lastBackupAt) {
    text = s.dirty ? t('backup.chip.pending') : t('backup.chip.ok', { time: fmt.relative(s.lastBackupAt) })
    Icon = s.dirty ? CloudUpload : CloudCheck
  } else if (signedIn) {
    // Cloud sync covers backups when signed in; don't alarm about local folder backup.
    text = account.status === 'idle' && account.lastSyncAt
      ? t('backup.chip.ok', { time: fmt.relative(account.lastSyncAt) })
      : t('backup.chip.cloud')
    Icon = CloudCheck
    tone = 'ok'
  } else {
    // Merely "not set up" stays quiet; only real failures raise attention.
    text = t('backup.chip.off')
    Icon = CloudOff
    tone = 'ok'
  }
  return (
    <a className="chip" data-tone={tone} href={href({ name: 'settings' })}>
      <Icon size={16} aria-hidden />
      {text}
    </a>
  )
}
