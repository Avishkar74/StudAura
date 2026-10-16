import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { LearningPath } from '@/api/types'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/toast/toastContext'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { useCreatePath, useUpdatePath } from './queries'

interface PathFormModalProps {
  /** Present when editing; absent when creating. */
  path?: LearningPath
  onClose: () => void
}

/** Create a learning path, or edit an existing one's title, description and target date. */
export function PathFormModal({ path, onClose }: PathFormModalProps) {
  const editing = path !== undefined
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreatePath()
  const update = useUpdatePath(path?.id ?? '')
  const [title, setTitle] = useState(path?.title ?? '')
  const [description, setDescription] = useState(path?.description ?? '')
  const [targetDate, setTargetDate] = useState(path?.target_date ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (editing) {
        const saved = await update.mutateAsync({
          title: title.trim(),
          description: description.trim() || null,
          target_date: targetDate || null,
        })
        toast.show(`Saved changes to “${saved.title}”`)
        onClose()
      } else {
        const created = await create.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          target_date: targetDate || undefined,
        })
        toast.show(`Created learning path “${created.title}”`)
        onClose()
        navigate(`/learning-paths/${created.id}`)
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? 'Please check the details. A title is required (up to 200 characters).'
          : editing
            ? 'Could not save your changes. Please try again.'
            : 'Could not create the learning path. Please try again.',
      )
    }
  }

  return (
    <Modal
      title={editing ? 'Edit learning path' : 'Create learning path'}
      description={
        editing
          ? 'Rename it, change what it is about, or set a target date.'
          : 'Group videos and playlists you want to learn together.'
      }
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
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Target date (optional)"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          {targetDate && (
            <button
              type="button"
              onClick={() => setTargetDate('')}
              className="self-start text-sm text-text-secondary underline hover:text-text-primary"
            >
              Clear target date
            </button>
          )}
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !title.trim()}>
            {editing
              ? pending
                ? 'Saving…'
                : 'Save changes'
              : pending
                ? 'Creating…'
                : 'Create path'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
