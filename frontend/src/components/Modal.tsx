import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

/** Accessible modal dialog: labelled, Escape closes, focus is trapped and restored on close. */
export function Modal({ title, description, onClose, children }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const first =
      panel.current?.querySelector<HTMLElement>('input, select, textarea') ??
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => opener?.focus?.()
  }, [])

  // Escape closes from anywhere. A document listener (not onKeyDown) keeps this working after
  // the focused control disappears, e.g. when a form is replaced by a result.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Browsers do not fire blur when a focused element is removed, so check after every render:
  // if focus is no longer inside the dialog (e.g. a form was replaced by its result), pull it
  // back in rather than leaving it on the page behind.
  useEffect(() => {
    const el = panel.current
    if (el && !el.contains(document.activeElement)) el.focus()
  })

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-surface-3 p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-text-secondary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
