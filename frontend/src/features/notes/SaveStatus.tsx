import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelative } from '@/lib/time'
import type { SaveState } from './useNoteAutosave'

interface SaveStatusProps {
  state: SaveState
  lastSavedAt: Date | null
  errorMessage: string | null
  onRetry: () => void
}

/** Re-render periodically so "Saved 2 minutes ago" stays true. */
function useMinuteTick(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [active])
}

/** The note's save state, always visible: Saving, Saved, unsaved changes, or an error with Retry. */
export function SaveStatus({ state, lastSavedAt, errorMessage, onRetry }: SaveStatusProps) {
  useMinuteTick(state === 'saved')

  if (state === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-warning">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        <span>{errorMessage ?? "Couldn't save your note."}</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-medium text-text-primary hover:bg-surface-3"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 text-sm text-text-secondary"
    >
      {state === 'saving' && (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Saving…
        </>
      )}
      {state === 'dirty' && 'Unsaved changes…'}
      {state === 'conflict' && 'Not saved: this note changed elsewhere.'}
      {(state === 'saved' || state === 'idle') && lastSavedAt && (
        <>
          <CircleCheck className="size-4 text-success" aria-hidden />
          Saved {formatRelative(lastSavedAt.toISOString())}
        </>
      )}
    </p>
  )
}
