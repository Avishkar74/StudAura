import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastApi, type ToastKind } from './toastContext'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

const LIFETIME_MS: Record<ToastKind, number> = { success: 4000, info: 4000, error: 7000 }
const MAX_VISIBLE = 4

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info } as const
const COLORS: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-warning',
  info: 'text-info',
}

/** Brief confirmations ("Learning path created"). Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const show = useCallback<ToastApi['show']>(
    (message, kind = 'success') => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), { id, message, kind }])
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), LIFETIME_MS[kind]),
      )
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface-3 px-4 py-3 text-sm shadow-xl"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${COLORS[t.kind]}`} aria-hidden />
              <p className="min-w-0 flex-1 break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 text-text-secondary hover:text-text-primary"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
