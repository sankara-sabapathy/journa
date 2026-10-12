import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useI18n } from '../i18n'
import { Button } from '@/components/ui/button'
import { IconButton } from '../components/IconButton'

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

let toasts: Toast[] = []
let nextId = 1
const subs = new Set<() => void>()
const emit = () => subs.forEach((fn) => fn())

export function toast(text: string, action?: Toast['action'], ms = 5000) {
  const id = nextId++
  toasts = [...toasts.slice(-2), { id, text, action }]
  emit()
  setTimeout(() => dismiss(id), ms)
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function Toasts() {
  const { t } = useI18n()
  const list = useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => toasts,
  )
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((item) => (
        <div className="toast" key={item.id}>
          <p>{item.text}</p>
          {item.action && (
            <Button
              variant="ghost"
              className="toast-action"
              onClick={() => {
                item.action!.run()
                dismiss(item.id)
              }}
            >
              {item.action.label}
            </Button>
          )}
          <IconButton size="icon-lg" className="toast-close" label={t('common.close')} onClick={() => dismiss(item.id)}>
            <X aria-hidden />
          </IconButton>
        </div>
      ))}
    </div>
  )
}
