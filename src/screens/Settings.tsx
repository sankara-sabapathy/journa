import { useLiveQuery } from 'dexie-react-hooks'
import { CircleAlert, CircleCheck, Download, FolderOpen, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { href } from '../app/router'
import { useTheme, type Theme } from '../app/theme'
import { toast } from '../app/toasts'
import { WrongPassphraseError } from '../backup/crypto'
import { backupFileName, backupFileText, exportMarkdownZip, importBackup, readBackupFile, type ImportMode } from '../backup/exportImport'
import { BackupFormatError, type Backup } from '../backup/format'
import { getBackupSettings, saveBackupSettings, scheduler } from '../backup/scheduler'
import { chooseBackupFolder, folderBackupSupported } from '../backup/targets/folderTarget'
import { useBackupState } from '../components/BackupChip'
import { Segmented } from '../components/Segmented'
import { LOCALES, useI18n, type Locale } from '../i18n'
import { storageInfo } from '../pwa/persistStorage'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
          {s.lastError && <p className="warn">{t('backup.failed', { error: s.lastError })}</p>}
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
        toast(err instanceof BackupFormatError ? t('data.badFile') : String(err))
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

export function Settings() {
  const { t, locale, setLocale } = useI18n()
  const [theme, setTheme] = useTheme()
  return (
    <div className="settings">
      <BackupPanel />
      <DataPanel />
      <StoragePanel />
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
      </section>
      <section className="panel" aria-labelledby="h-about">
        <h2 id="h-about">{t('settings.about')}</h2>
        <p>{t('settings.aboutText')}</p>
        <Button size="lg" variant="outline" className="justify-self-start" render={<a href={href({ name: 'trash' })} />}>
          <Trash2 aria-hidden />
          {t('nav.trash')}
        </Button>
      </section>
    </div>
  )
}
