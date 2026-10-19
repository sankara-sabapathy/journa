import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { scheduler } from './backup/scheduler'
import { folderTarget } from './backup/targets/folderTarget'
import { I18nProvider } from './i18n'
import { requestPersistence } from './pwa/persistStorage'
import { syncEngine } from './sync/engine'
import { applyAccent, readAccent } from './app/accent'
import './styles/tokens.css'
import './styles/coss.css'
import './styles/app.css'

applyAccent(readAccent())
void requestPersistence()
void scheduler.start(folderTarget)
void syncEngine.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
