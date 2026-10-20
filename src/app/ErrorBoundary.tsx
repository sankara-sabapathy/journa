import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render crash so the app shows a calm message instead of a blank
 * page. The entries live in IndexedDB, so nothing is lost by reloading.
 *
 * The fallback deliberately uses no context or hooks: it has to work even
 * when the providers above it are what failed.
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
  return (
    <div className="empty not-found">
      <strong>Journa ran into a problem</strong>
      <p>Your entries are safe on this device. Reload the app to carry on.</p>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
        Reload
      </button>
    </div>
  )
}
