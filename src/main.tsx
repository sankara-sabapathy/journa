import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { scheduler } from './backup/scheduler'
import { folderTarget } from './backup/targets/folderTarget'
import { I18nProvider } from './i18n'
import { requestPersistence } from './pwa/persistStorage'
import './styles/tokens.css'
import './styles/coss.css'
import './styles/app.css'

void requestPersistence()
void scheduler.start(folderTarget)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
