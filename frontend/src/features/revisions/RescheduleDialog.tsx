import { useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { addDays, formatDue } from '@/lib/time'
import { useFlagRevision } from './queries'

interface Props {
  videoId: string
  title: string
  /** Today in the student's timezone, from the server. */
  today: string
  /** The current due date. */
  dueAt: string
  onClose: () => void
}

const PRESETS: [string, number][] = [
  ['Tomorrow', 1],
  ['In 3 days', 3],
  ['Next week', 7],
]

/** Move a revision to another day. */
export function RescheduleDialog({ videoId, title, today, dueAt, onClose }: Props) {
  const flag = useFlagRevision(videoId)
  const [value, setValue] = useState(dueAt)
  const [error, setError] = useState<string | null>(null)

  async function save(date: string) {
    setError(null)
    if (!date || date < today) {
      setError("Pick today or a later day. A revision can't be scheduled in the past.")
      return
    }
    try {
      await flag.mutateAsync(date)
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? err.message
          : 'Could not reschedule. Please try again.',
      )
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void save(value)
  }

  return (
    <Modal
      title="Reschedule revision"
      description={`${title} · currently ${formatDue(dueAt, today).toLowerCase()}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div role="group" aria-label="Quick choices" className="flex flex-wrap gap-2">
          {PRESETS.map(([label, days]) => (
            <button
              key={label}
              type="button"
              disabled={flag.isPending}
              onClick={() => void save(addDays(today, days))}
              className="rounded-full border border-border px-3 py-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
        <TextField
          label="Or pick a day"
          type="date"
          min={today}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={flag.isPending}>
            {flag.isPending ? 'Saving…' : 'Reschedule'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
