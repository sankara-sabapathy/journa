import { Compass } from 'lucide-react'
import { href } from '../app/router'
import { useI18n } from '../i18n'

/** Shown for a link that points at nothing. The page title already says so. */
export function NotFound() {
  const { t } = useI18n()
  return (
    <div className="empty not-found">
      <Compass size={32} aria-hidden />
      <p>{t('notFound.text')}</p>
      <a className="btn btn-primary" href={href({ name: 'today' })}>
        {t('notFound.home')}
      </a>
    </div>
  )
}
