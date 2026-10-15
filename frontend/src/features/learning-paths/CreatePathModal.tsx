import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { useCreatePath } from './queries'

export function CreatePathModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreatePath()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const path = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        target_date: targetDate || undefined,
      })
      onClose()
      navigate(`/learning-paths/${path.id}`)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? 'Please check the details. A title is required (up to 200 characters).'
          : 'Could not create the learning path. Please try again.',
      )
    }
  }

  return (
    <Modal
      title="Create learning path"
      description="Group videos and playlists you want to learn together."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Title"
          required
          maxLength={200}
          placeholder="e.g. Data Structures & Algorithms"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="path-description" className="text-sm font-medium text-text-secondary">
            Description (optional)
          </label>
          <textarea
            id="path-description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary"
          />
        </div>
        <TextField
          label="Target date (optional)"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Creating…' : 'Create path'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
