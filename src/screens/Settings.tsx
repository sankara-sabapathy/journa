import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, CircleCheck, Download, FolderOpen, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { href } from '../app/router'
import { ACCENTS, useAccent } from '../app/accent'
import { AppError, useErrorMessage } from '../app/errors'
import { useTheme, type Theme } from '../app/theme'
import { toast } from '../app/toasts'
import { WrongPassphraseError } from '../backup/crypto'
import { repo } from '../db/repo'
import { backupFileName, backupFileText, exportMarkdownZip, importBackup, readBackupFile, type ImportMode } from '../backup/exportImport'
import { BackupFormatError, type Backup } from '../backup/format'
import { getBackupSettings, saveBackupSettings, scheduler } from '../backup/scheduler'
import { chooseBackupFolder, folderBackupSupported } from '../backup/targets/folderTarget'
import { useBackupState } from '../components/BackupChip'
import { Segmented } from '../components/Segmented'
import { LOCALES, useI18n, type Locale } from '../i18n'
import { storageInfo } from '../pwa/persistStorage'
import { DEFAULT_SET_ID, parseQuestions, setsStore, type QuestionSet } from '../journal/sets'
import {
  approveDevice,
  deleteAccount,
  ensureDeviceIdentity,
  enrollDevice,
  exportRecoveryKey,
  importRecoveryKey,
  listDevices,
  localDataKey,
  hasAcknowledgedRecovery,
  acknowledgeRecovery,
  revokeDevice,
  APPROVAL_POLL_MS,
  type DeviceRecord,
} from '../sync/devices'
import { syncEngine, useAccountState, useConflicts } from '../sync/engine'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type DiffRow = { kind: 'same' | 'del' | 'add'; text: string }

function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'del', text: a[i] })
      i++
    } else {
      rows.push({ kind: 'add', text: b[j] })
      j++
    }
  }
  while (i < a.length) rows.push({ kind: 'del', text: a[i++] })
  while (j < b.length) rows.push({ kind: 'add', text: b[j++] })
  return rows
}

function ConflictsPanel() {
  const { t } = useI18n()
  const describe = useErrorMessage()
  const conflicts = useConflicts()
  const [busyId, setBusyId] = useState<string | null>(null)
  if (conflicts.length === 0) return null

  async function run(id: string, fn: (id: string) => Promise<unknown>) {
    setBusyId(id)
    try {
      await fn(id)
    } catch (err) {
      toast(describe(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <p role="status" className="sr-only">
        {conflicts.length > 0 ? t('conflicts.announced', { count: conflicts.length }) : ''}
      </p>
      {conflicts.length === 0 ? null : (
    <section className="panel" aria-labelledby="h-conflicts">
      <h2 id="h-conflicts">{t('conflicts.title')}</h2>
      <p className="muted">{t('conflicts.hint')}</p>
      {conflicts.map((c) => (
        <article key={c.id} className="conflict">
          <h3>{c.local?.title || c.incoming.title || t('entry.untitled')}</h3>
          <div className="conflict-cols">
            <div>
              <h4>{t('conflicts.mine')}</h4>
              <pre className="conflict-text">{c.local ? `${c.local.title}\n${c.local.body}` : ''}</pre>
            </div>
            <div>
              <h4>{t('conflicts.theirs')}</h4>
              <pre className="conflict-text">{`${c.incoming.title}\n${c.incoming.body}`}</pre>
            </div>
          </div>
          {c.local && (
            <ul className="conflict-diff" aria-label={t('conflicts.title')}>
              {diffLines(c.local.body, c.incoming.body).map((row, n) => (
                <li key={n} data-kind={row.kind}>
                  {row.text || ' '}
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row">
            <Button size="lg" variant="outline" loading={busyId === c.id} onClick={() => void run(c.id, syncEngine.resolveConflictKeepLocal)}>
              {t('conflicts.keepMine')}
            </Button>
            <Button size="lg" variant="outline" loading={busyId === c.id} onClick={() => void run(c.id, syncEngine.resolveConflictKeepIncoming)}>
              {t('conflicts.keepTheirs')}
            </Button>
            <Button size="lg" variant="ghost" loading={busyId === c.id} onClick={() => void run(c.id, syncEngine.resolveConflictKeepBoth)}>
              {t('conflicts.keepBoth')}
            </Button>
          </div>
        </article>
      ))}
      </section>
      )}
    </>
  )
}

function AccountPanel() {
  const { t, fmt } = useI18n()
  const account = useAccountState()
  const describe = useErrorMessage()
  const [mode, setMode] = useState<'sign-in' | 'create'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(describe(err))
    } finally {
      setBusy(false)
    }
  }

  if (account.status === 'signed-out') {
    const creating = mode === 'create'
    const passwordMismatch = creating && password2.length > 0 && password !== password2
    const canSubmit = creating
      ? email.trim().length > 0 && password.length > 0 && password === password2
      : email.trim().length > 0
    return (
      <section className="panel" aria-labelledby="h-account">
        <h2 id="h-account">{t('account.title')}</h2>
        <p className="muted">{creating ? t('account.createHint') : t('account.optionalHint')}</p>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSubmit) return
            const address = email.trim()
            if (creating) void run(() => syncEngine.createAccount(address, password))
            else void run(() => syncEngine.beginEmailSignIn(address))
          }}
        >
          <label htmlFor="account-email">{t('account.email')}</label>
          <Input
            id="account-email"
            size="lg"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('account.emailPlaceholder')}
          />
          {creating && (
            <>
              <label htmlFor="account-password">{t('account.password')}</label>
              <Input
                id="account-password"
                size="lg"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="account-password-hint"
              />
              <p className="hint" id="account-password-hint">
                {t('account.passwordHint')}
              </p>
              <label htmlFor="account-password2">{t('account.passwordConfirm')}</label>
              <Input
                id="account-password2"
                size="lg"
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                aria-invalid={passwordMismatch || undefined}
                aria-describedby={passwordMismatch ? 'account-password-error' : undefined}
              />
              {passwordMismatch && (
                <p className="warn" id="account-password-error">
                  {t('account.passwordMismatch')}
                </p>
              )}
            </>
          )}
          <div className="btn-row">
            {creating ? (
              <>
                <Button size="lg" type="submit" loading={busy} disabled={!canSubmit}>
                  {t('account.create')}
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => {
                    setMode('sign-in')
                    setPassword('')
                    setPassword2('')
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" type="submit" loading={busy} disabled={!canSubmit}>
                  {t('account.signInEmail')}
                </Button>
                <Button size="lg" variant="outline" onClick={() => setMode('create')}>
                  {t('account.create')}
                </Button>
              </>
            )}
          </div>
        </form>
      </section>
    )
  }

  if (account.status === 'awaiting-code') {
    const confirming = account.purpose === 'confirm'
    return (
      <section className="panel" aria-labelledby="h-account">
        <h2 id="h-account">{t('account.title')}</h2>
        <p className="muted">
          {confirming
            ? t('account.codeSentConfirm', { email: account.email })
            : t('account.codeSent', { email: account.email })}
        </p>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) void run(() => syncEngine.verifyCode(code.trim()))
          }}
        >
          <label htmlFor="account-code">{t('account.code')}</label>
          <Input
            id="account-code"
            size="lg"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="btn-row">
            <Button size="lg" type="submit" loading={busy} disabled={!code.trim()}>
              {t('account.verify')}
            </Button>
            <Button size="lg" variant="outline" loading={busy} onClick={() => void run(() => syncEngine.resendCode())}>
              {t('account.resendCode')}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => syncEngine.cancelAuth()}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </section>
    )
  }

  const syncing = account.status === 'syncing'
  async function eraseEverything() {
    setBusy(true)
    try {
      await deleteAccount()
      setConfirmDelete(false)
      await syncEngine.signOut()
      toast(t('account.deleted'))
    } catch (err) {
      toast(describe(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel" aria-labelledby="h-account">
      <h2 id="h-account">{t('account.title')}</h2>
      <p>{account.email}</p>
      <p className="muted">{account.lastSyncAt ? t('account.lastSync', { time: fmt.relative(account.lastSyncAt) }) : t('account.neverSynced')}</p>
      {account.status === 'error' && (
        <p className="warn" role="status">
          {t(account.error)}
        </p>
      )}
      <div className="btn-row">
        <Button size="lg" variant="outline" loading={syncing || busy} onClick={() => void run(() => syncEngine.syncNow())}>
          {t('account.syncNow')}
        </Button>
        <Button size="lg" variant="ghost" loading={busy} onClick={() => void run(() => syncEngine.signOut())}>
          {t('account.signOut')}
        </Button>
      </div>
      <div className="btn-row">
        {confirmDelete ? (
          <Button size="lg" variant="destructive" loading={busy} onClick={() => void eraseEverything()}>
            {t('account.deleteConfirm')}
          </Button>
        ) : (
          <Button size="lg" variant="ghost" onClick={() => setConfirmDelete(true)}>
            {t('account.delete')}
          </Button>
        )}
      </div>
    </section>
  )
}

function DevicesPanel() {
  const { t } = useI18n()
  const describe = useErrorMessage()
  const account = useAccountState()
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [thisId, setThisId] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [recovery, setRecovery] = useState<string | null>(null)
  const [importKey, setImportKey] = useState('')
  const [busy, setBusy] = useState(false)
  /** null: unknown yet; otherwise the enrollment outcome from the server. */
  const [enrollment, setEnrollment] = useState<'ready' | 'waiting' | 'first' | null>(null)
  const [recoveryAcked, setRecoveryAcked] = useState(true)
  const [approvedFlash, setApprovedFlash] = useState(false)
  const signedIn = account.status === 'idle' || account.status === 'syncing' || account.status === 'error'

  const refresh = useCallback(async () => {
    const identity = await ensureDeviceIdentity()
    setThisId(identity.deviceId)
    setDevices(await listDevices())
    setHasKey((await localDataKey()) !== null)
  }, [])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      await checkEnrollment()
      await refresh()
    } catch (err) {
      toast(describe(err))
    } finally {
      setBusy(false)
    }
  }

  /** Ask the server if an approval landed, and pick up the key if so. */
  const checkEnrollment = useCallback(async () => {
    let transition: Awaited<ReturnType<typeof enrollDevice>> | null = null
    try {
      transition = await enrollDevice('Journa device')
    } catch {
      /* Offline or mid-sign-out: keep whatever the panel last knew. */
      return
    }
    const result = transition
    if (result.status === 'ready') {
      setEnrollment((prev) => {
        if (prev === 'waiting') {
          setApprovedFlash(true)
          void refresh()
        }
        return 'ready'
      })
      setHasKey(true)
      setRecoveryAcked(await hasAcknowledgedRecovery())
    } else if (result.status === 'first') {
      setEnrollment('first')
      setHasKey(true)
      setRecovery(result.recoveryKey)
      setRecoveryAcked(await hasAcknowledgedRecovery())
    } else {
      setEnrollment('waiting')
      setHasKey(false)
    }
  }, [refresh])

  // Check on mount and sign-in, then poll while waiting so the panel moves
  // on by itself the moment the other device approves.
  useEffect(() => {
    if (!signedIn) return
    void checkEnrollment()
    void refresh()
  }, [signedIn, account.status, checkEnrollment, refresh])

  useEffect(() => {
    if (!signedIn || enrollment !== 'waiting') return
    const timer = setInterval(() => void checkEnrollment(), APPROVAL_POLL_MS)
    return () => clearInterval(timer)
  }, [signedIn, enrollment, checkEnrollment])

  async function approveListed(deviceId: string) {
    const dek = await localDataKey()
    if (!dek) throw new AppError('error.firstDeviceOnly')
    await approveDevice(deviceId, dek)
  }

  if (!signedIn) return null

  return (
    <section className="panel" aria-labelledby="h-devices">
      <h2 id="h-devices">{t('devices.title')}</h2>
      <p className="muted">{t('devices.hint')}</p>
      {approvedFlash && (
        <p role="status" className="confirm">
          {t('devices.approved')}
        </p>
      )}
      {/* A first device holds the only copy of the key until it is saved elsewhere. */}
      {enrollment === 'first' && recovery && !recoveryAcked && (
        <>
          <p className="warn">{t('devices.noRecoveryWarning')}</p>
          <p className="recovery-key">{recovery}</p>
          <div className="btn-row">
            <Button
              size="lg"
              variant="outline"
              onClick={() =>
                void (async () => {
                  await acknowledgeRecovery()
                  setRecoveryAcked(true)
                })()
              }
            >
              {t('devices.recoverySaved')}
            </Button>
          </div>
        </>
      )}
      <ul className="device-list">
        {devices.map((d) => (
          <li key={d.deviceId} className="device-row">
            <span className="device-id" title={d.deviceId}>
              {d.deviceId === thisId ? t('devices.thisDevice') : d.deviceId.slice(0, 8)}
            </span>
            {d.deviceId !== thisId && hasKey && (
              <Button size="lg" variant="outline" loading={busy} onClick={() => void run(() => approveListed(d.deviceId))}>
                {t('devices.approve')}
              </Button>
            )}
            {d.deviceId !== thisId && (
              <Button size="lg" variant="ghost" loading={busy} onClick={() => void run(() => revokeDevice(d.deviceId))}>
                {t('devices.revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {enrollment === 'waiting' && (
        <p className="muted" role="status">
          {t('devices.waiting')}
        </p>
      )}
      {!hasKey && (
        <>
          {enrollment === 'waiting' && (
            <div className="btn-row">
              <Button size="lg" variant="outline" loading={busy} onClick={() => void run(() => checkEnrollment())}>
                {t('devices.enable')}
              </Button>
            </div>
          )}
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault()
              if (importKey.trim()) void run(() => importRecoveryKey(importKey.trim()))
            }}
          >
            <label htmlFor="recovery-import">{t('devices.importRecovery')}</label>
            <Input
              id="recovery-import"
              size="lg"
              autoComplete="off"
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
            />
            <div className="btn-row">
              <Button size="lg" type="submit" variant="outline" disabled={!importKey.trim()}>
                {t('devices.import')}
              </Button>
            </div>
          </form>
        </>
      )}
      {hasKey && enrollment !== 'first' && (
        <>
          <div className="btn-row">
            <Button
              size="lg"
              variant="outline"
              onClick={async () => setRecovery(recovery ? null : await exportRecoveryKey())}
            >
              {t('devices.showRecovery')}
            </Button>
          </div>
          {recovery && (
            <>
              <p className="muted">{t('devices.recoveryHint')}</p>
              <p className="recovery-key">{recovery}</p>
            </>
          )}
        </>
      )}
    </section>
  )
}

function BackupPanel() {
  const { t, fmt, locale } = useI18n()
  const s = useBackupState()
  const settings = useLiveQuery(() => getBackupSettings(), [])
  const [pass, setPass] = useState('')

  const statusText = {
    ready: t('backup.status.ready', { folder: s.folder ?? '' }),
    'needs-permission': t('backup.status.needsPermission', { folder: s.folder ?? '' }),
    'not-configured': t('backup.status.notConfigured'),
    unavailable: t('backup.status.unavailable'),
  }[s.status]
  const good = s.status === 'ready' && !s.lastError

  return (
    <section className="panel" aria-labelledby="h-backup">
      <h2 id="h-backup">{t('backup.title')}</h2>
      <div className="status-line">
        {good ? <CircleCheck className="ok" size={18} aria-hidden /> : <CircleAlert className="warn" size={18} aria-hidden />}
        <div>
          <p>{statusText}</p>
          <p className="muted">{s.lastBackupAt ? t('backup.last', { time: fmt.relative(s.lastBackupAt) }) : t('backup.never')}</p>
          {s.lastError && <p className="warn">{t(s.lastError)}</p>}
        </div>
      </div>

      {folderBackupSupported() && (
        <>
          <div className="btn-row">
            {s.status === 'needs-permission' && (
              <Button size="lg" onClick={() => void scheduler.reconnect()}>
                {t('backup.allow')}
              </Button>
            )}
            <Button
              size="lg"
              variant={s.status === 'not-configured' ? 'default' : 'outline'}
              onClick={async () => {
                if (await chooseBackupFolder()) {
                  await scheduler.refresh()
                  if (await scheduler.runNow()) toast(t('backup.done'))
                }
              }}
            >
              <FolderOpen aria-hidden />
              {s.status === 'not-configured' ? t('backup.choose') : t('backup.change')}
            </Button>
            {s.status === 'ready' && (
              <Button
                size="lg"
                variant="outline"
                loading={s.running}
                onClick={async () => {
                  if (await scheduler.runNow()) toast(t('backup.done'))
                }}
              >
                {t('backup.now')}
              </Button>
            )}
          </div>
          <p className="muted">{t('backup.tip')}</p>
          {settings && (
            <>
              <label className="switch">
                {t('backup.auto')}
                <input type="checkbox" checked={settings.enabled} onChange={(e) => void saveBackupSettings({ enabled: e.target.checked })} />
              </label>
              <div className="field">
                <label htmlFor="keep">{t('backup.keep')}</label>
                <select id="keep" className="input" value={settings.keep} onChange={(e) => void saveBackupSettings({ keep: Number(e.target.value) })}>
                  {[5, 10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {new Intl.NumberFormat(locale).format(n)}
                    </option>
                  ))}
                </select>
              </div>
              <form
                className="field"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await saveBackupSettings({ passphrase: pass })
                  setPass('')
                  toast(t('backup.passphraseSaved'))
                }}
              >
                <label htmlFor="pass">{t('backup.passphrase')}</label>
                <Input
                  id="pass"
                  size="lg"
                  type="password"
                  autoComplete="new-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={settings.passphrase ? '••••••••' : undefined}
                  aria-describedby="pass-hint"
                />
                <span className="hint" id="pass-hint">
                  {t('backup.passphraseHint')}
                </span>
                <div className="btn-row">
                  <Button type="submit" size="lg" variant="outline" disabled={!pass}>
                    {t('backup.passphraseSave')}
                  </Button>
                  {settings.passphrase && (
                    <Button size="lg" variant="ghost" onClick={() => void saveBackupSettings({ passphrase: '' })}>
                      {t('backup.passphraseClear')}
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </>
      )}
    </section>
  )
}

function DataPanel() {
  const { t } = useI18n()
  const describe = useErrorMessage()
  const trashCount = useLiveQuery(() => repo.listTrash().then((rows) => rows.length), []) ?? 0
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [asking, setAsking] = useState(false)
  const [passValue, setPassValue] = useState('')
  const [passError, setPassError] = useState(false)
  const passResolve = useRef<(v: string | null) => void>(undefined)

  const askPassphrase = () =>
    new Promise<string | null>((resolve) => {
      passResolve.current = resolve
      setPassValue('')
      setAsking(true)
    })

  const answer = (v: string | null) => {
    setAsking(false)
    passResolve.current?.(v)
    passResolve.current = undefined
  }

  async function onFile(file: File) {
    const text = await file.text()
    setPassError(false)
    for (;;) {
      try {
        const backup = await readBackupFile(text, askPassphrase)
        if (!backup) return
        setMode('merge')
        setPending(backup)
        return
      } catch (err) {
        if (err instanceof WrongPassphraseError) {
          setPassError(true)
          continue
        }
        toast(err instanceof BackupFormatError ? t('data.badFile') : describe(err))
        return
      }
    }
  }

  return (
    <section className="panel" aria-labelledby="h-data">
      <h2 id="h-data">{t('data.title')}</h2>
      <div className="btn-row">
        <Button size="lg" variant="outline" onClick={async () => download(backupFileName(), await backupFileText(), 'application/json')}>
          <Download aria-hidden />
          {t('data.exportJson')}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={async () =>
            download(backupFileName(new Date(), 'zip').replace('backup', 'markdown'), (await exportMarkdownZip()) as BlobPart, 'application/zip')
          }
        >
          <Download aria-hidden />
          {t('data.exportMd')}
        </Button>
        <Button size="lg" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden />
          {t('data.import')}
        </Button>
        <Button size="lg" variant="outline" render={<a href={href({ name: 'trash' })} />}>
          <Trash2 aria-hidden />
          {t('nav.trash')} · {t('trash.count', { count: trashCount })}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.jbak,application/json"
          hidden
          aria-label={t('data.import')}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onFile(f)
          }}
        />
      </div>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogPopup showCloseButton={false}>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!pending) return
              const r = await importBackup(pending, mode)
              setPending(null)
              toast(t('data.imported', { added: r.added, updated: r.updated, skipped: r.skipped }))
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('data.importMode')}</DialogTitle>
            </DialogHeader>
            <DialogPanel className="grid gap-3">
              {(['merge', 'replace'] as const).map((m) => (
                <label className="radio" key={m}>
                  <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                  <span>
                    <strong>{t(`data.${m}`)}</strong>
                    <br />
                    <span className="muted">{t(`data.${m}Hint`)}</span>
                  </span>
                </label>
              ))}
            </DialogPanel>
            <DialogFooter>
              <Button size="lg" variant="ghost" onClick={() => setPending(null)}>
                {t('data.cancel')}
              </Button>
              <Button size="lg" type="submit" variant={mode === 'replace' ? 'destructive' : 'default'}>
                {t('data.importConfirm', { count: pending?.entries.length ?? 0 })}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>

      <Dialog open={asking} onOpenChange={(open) => !open && answer(null)}>
        <DialogPopup showCloseButton={false}>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              answer(passValue)
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('data.askPassphrase')}</DialogTitle>
              {passError && <DialogDescription className="warn">{t('data.wrongPassphrase')}</DialogDescription>}
            </DialogHeader>
            <DialogPanel>
              <Input
                size="lg"
                type="password"
                autoFocus
                value={passValue}
                onChange={(e) => setPassValue(e.target.value)}
                aria-label={t('backup.passphrase')}
                aria-invalid={passError || undefined}
              />
            </DialogPanel>
            <DialogFooter>
              <Button size="lg" variant="ghost" onClick={() => answer(null)}>
                {t('data.cancel')}
              </Button>
              <Button size="lg" type="submit">
                {t('data.open')}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </section>
  )
}

function StoragePanel() {
  const { t, fmt } = useI18n()
  const [info, setInfo] = useState<Awaited<ReturnType<typeof storageInfo>> | null>(null)
  useEffect(() => {
    void storageInfo().then(setInfo)
  }, [])
  if (!info) return null
  return (
    <section className="panel" aria-labelledby="h-storage">
      <h2 id="h-storage">{t('storage.title')}</h2>
      <div className="status-line">
        {info.persisted ? <CircleCheck className="ok" size={18} aria-hidden /> : <CircleAlert className="warn" size={18} aria-hidden />}
        <p>{info.persisted ? t('storage.persisted') : t('storage.notPersisted')}</p>
      </div>
      {info.usage !== null && <p className="muted">{t('storage.used', { used: fmt.bytes(info.usage) })}</p>}
    </section>
  )
}

function QuestionsPanel() {
  const { t } = useI18n()
  const data = useLiveQuery(async () => ({ sets: await setsStore.list(), activeId: await setsStore.activeId() }), [])
  const [editing, setEditing] = useState<{ id?: string; name: string; questions: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!data) return null
  const { sets, activeId } = data

  function start(set?: QuestionSet) {
    setConfirmDelete(false)
    setEditing(
      set
        ? { id: set.id, name: set.name, questions: set.questions.join('\n') }
        : { name: '', questions: '' },
    )
  }

  const questions = editing ? parseQuestions(editing.questions) : []
  const valid = Boolean(editing && editing.name.trim() && questions.length)

  async function save() {
    if (!editing || !valid) return
    await setsStore.save({ id: editing.id, name: editing.name, questions })
    setEditing(null)
  }

  async function remove(id: string) {
    if (!confirmDelete) return setConfirmDelete(true)
    await setsStore.remove(id)
    setEditing(null)
  }

  return (
    <section className="panel" aria-labelledby="h-questions">
      <h2 id="h-questions">{t('questions.title')}</h2>
      <div className="field">
        <label htmlFor="ask-set">{t('questions.askFrom')}</label>
        <select id="ask-set" className="input" value={activeId} onChange={(e) => void setsStore.setActive(e.target.value)}>
          <option value={DEFAULT_SET_ID}>{t('questions.builtin')}</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="hint">{t('questions.hint')}</span>
      </div>

      {sets.length > 0 && (
        <ul className="rows">
          {sets.map((s) => (
            <li key={s.id} className="row">
              <div className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-meta">{t('questions.count', { count: s.questions.length })}</span>
              </div>
              <Button size="lg" variant="outline" onClick={() => start(s)}>
                {t('questions.edit')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="btn-row">
        <Button size="lg" variant="outline" onClick={() => start()}>
          {t('questions.new')}
        </Button>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogPopup showCloseButton={false}>
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing?.id ? t('questions.editTitle') : t('questions.new')}</DialogTitle>
            </DialogHeader>
            <DialogPanel className="grid gap-3">
              <div className="field">
                <label htmlFor="set-name">{t('questions.name')}</label>
                <Input
                  id="set-name"
                  size="lg"
                  autoFocus
                  value={editing?.name ?? ''}
                  placeholder={t('questions.namePlaceholder')}
                  onChange={(e) => setEditing((x) => (x ? { ...x, name: e.target.value } : x))}
                />
              </div>
              <div className="field">
                <label htmlFor="set-questions">{t('questions.questions')}</label>
                <textarea
                  id="set-questions"
                  className="input set-questions"
                  rows={6}
                  value={editing?.questions ?? ''}
                  aria-describedby="set-questions-hint"
                  onChange={(e) => setEditing((x) => (x ? { ...x, questions: e.target.value } : x))}
                />
                <span className="hint" id="set-questions-hint">
                  {t('questions.questionsHint')}
                </span>
              </div>
            </DialogPanel>
            <DialogFooter>
              {editing?.id && (
                <Button
                  size="lg"
                  className="me-auto"
                  variant={confirmDelete ? 'destructive' : 'ghost'}
                  onClick={() => void remove(editing.id!)}
                >
                  {confirmDelete ? t('questions.deleteConfirm') : t('questions.delete')}
                </Button>
              )}
              <Button size="lg" variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button size="lg" type="submit" disabled={!valid}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </section>
  )
}

export function Settings() {
  const { t, locale, setLocale } = useI18n()
  const [theme, setTheme] = useTheme()
  const [accent, setAccent] = useAccent()
  return (
    <div className="settings">
      <ConflictsPanel />
      <AccountPanel />
      <DevicesPanel />
      <BackupPanel />
      <DataPanel />
      <StoragePanel />
      <QuestionsPanel />
      <section className="panel" aria-labelledby="h-look">
        <h2 id="h-look">{t('settings.theme')}</h2>
        <div className="field">
          <label htmlFor="lang">{t('settings.language')}</label>
          <select id="lang" className="input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          label={t('settings.theme')}
          value={theme}
          onChange={setTheme}
          options={(['system', 'light', 'dark'] as Theme[]).map((x) => ({ value: x, label: t(`settings.theme.${x}`) }))}
        />
        <div className="field">
          <span className="label" id="accent-label">{t('settings.accent')}</span>
          <div className="swatches" role="group" aria-labelledby="accent-label">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="swatch"
                style={{ backgroundColor: a.kaavi }}
                aria-label={t(`accent.${a.id}`)}
                aria-describedby={`swatch-tip-${a.id}`}
                aria-pressed={accent === a.id}
                data-tip={t(`accent.${a.id}`)}
                title={t(`accent.${a.id}`)}
                onClick={() => setAccent(a.id)}
              >
                <span role="tooltip" id={`swatch-tip-${a.id}`} className="sr-only">
                  {t(`accent.${a.id}`)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="panel" aria-labelledby="h-about">
        <h2 id="h-about">{t('settings.about')}</h2>
        <p>{t('settings.aboutText')}</p>
      </section>
    </div>
  )
}
