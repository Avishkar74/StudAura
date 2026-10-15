import { useState, type FormEvent } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { browserTimezone, useSaveGoal } from './queries'

export const MIN_MINUTES = 1
export const MAX_MINUTES = 1440
const PRESETS = [30, 60, 90, 120]

/** Set or change the daily viewing target. */
export function GoalDialog({ current, onClose }: { current: number | null; onClose: () => void }) {
  const save = useSaveGoal()
  const [value, setValue] = useState(current ? String(current) : '60')
  const [error, setError] = useState<string | null>(null)

  const minutes = Number(value)
  const valid = Number.isInteger(minutes) && minutes >= MIN_MINUTES && minutes <= MAX_MINUTES

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError(`Enter a whole number of minutes from ${MIN_MINUTES} to ${MAX_MINUTES}.`)
      return
    }
    try {
      await save.mutateAsync(minutes)
      onClose()
    } catch {
      setError('Could not save your goal. Please try again.')
    }
  }

  return (
    <Modal
      title={current ? 'Edit daily goal' : 'Set a daily goal'}
      description="How long do you want to spend watching each day? Only time the video is actually playing counts."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Minutes per day"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hint={`Your day starts and ends at midnight in ${browserTimezone()}.`}
        />
        <div role="group" aria-label="Common goals" className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setValue(String(p))}
              aria-pressed={minutes === p}
              className={`rounded-full border px-3 py-1 text-sm ${
                minutes === p
                  ? 'border-accent text-text-primary'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {p} min
            </button>
          ))}
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save goal'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
