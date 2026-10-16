import { useState } from 'react'
import type { LearningPath } from '@/api/types'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useToast } from '@/components/toast/toastContext'
import { FormError } from '@/features/auth/AuthCard'
import { useDeletePath } from './queries'

/** Asks before deleting a path. Videos, notes and progress are not deleted with it. */
export function DeletePathDialog({
  path,
  onClose,
  onDeleted,
}: {
  path: LearningPath
  onClose: () => void
  onDeleted?: () => void
}) {
  const remove = useDeletePath()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setError(null)
    try {
      await remove.mutateAsync(path.id)
      toast.show(`Deleted learning path “${path.title}”`)
      onClose()
      onDeleted?.()
    } catch {
      setError('Could not delete the learning path. Please try again.')
    }
  }

  return (
    <Modal
      title="Delete learning path?"
      description={`“${path.title}” will be removed from your paths.`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          The path and its list of {path.total_videos}{' '}
          {path.total_videos === 1 ? 'video' : 'videos'} are deleted. Your notes, comments, watch
          progress and saved videos are kept.
        </p>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete path'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
