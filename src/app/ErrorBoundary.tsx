import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render crash so the app shows a calm message instead of a blank
 * page. The entries live in IndexedDB, so nothing is lost by reloading.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Journa crashed while rendering', error, info.componentStack)
  }

  render() {
    if (this.state.error) return <CrashScreen />
    return this.props.children
  }
}

function CrashScreen() {
  const { t } = useI18n()
  return (
    <div className="empty not-found">
      <strong>{t('crash.title')}</strong>
      <p>{t('crash.text')}</p>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
        {t('crash.reload')}
      </button>
    </div>
  )
}
