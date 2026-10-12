import { Download, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useI18n } from '../i18n'
import { Button } from '@/components/ui/button'
import { IconButton } from '../components/IconButton'
import { isIOS, isStandalone } from './persistStorage'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'journa.installDismissed'

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function OfflineBar() {
  const { t } = useI18n()
  return useOnline() ? null : (
    <div className="offline" role="status">
      {t('pwa.offline')}
    </div>
  )
}

/** Install offer (Chromium prompt, or iOS instructions) and the update banner. */
export function PwaBanners() {
  const { t } = useI18n()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(dismissed)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* storage blocked */
    }
  }

  if (needRefresh) {
    return (
      <div className="banner" role="status" style={{ marginBottom: 'var(--s4)' }}>
        <p>{t('pwa.update')}</p>
        <Button size="lg" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.reload')}
        </Button>
      </div>
    )
  }

  if (hidden || isStandalone()) return null
  if (!evt && !isIOS()) return null
  return (
    <div className="banner" style={{ marginBottom: 'var(--s4)' }}>
      <p>{evt ? t('pwa.installHint') : t('pwa.installIOS')}</p>
      {evt && (
        <Button
          size="lg"
          onClick={async () => {
            await evt.prompt()
            await evt.userChoice
            setEvt(null)
          }}
        >
          <Download aria-hidden />
          {t('pwa.install')}
        </Button>
      )}
      <IconButton label={t('common.close')} onClick={hide}>
        <X aria-hidden />
      </IconButton>
    </div>
  )
}
