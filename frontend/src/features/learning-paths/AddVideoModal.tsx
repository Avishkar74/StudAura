import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { VideoImportResult } from '@/api/types'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { useImportVideo, useLearningPaths } from './queries'

interface AddVideoModalProps {
  onClose: () => void
  onCreatePath: () => void
  /** Pre-select a path (e.g. when opened from a path page). */
  defaultPathId?: string
}

export function AddVideoModal({ onClose, onCreatePath, defaultPathId }: AddVideoModalProps) {
  const paths = useLearningPaths()
  const importer = useImportVideo()
  const [url, setUrl] = useState('')
  const [pathId, setPathId] = useState(defaultPathId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ data: VideoImportResult; pathId: string } | null>(null)

  const items = paths.data?.items ?? []
  const selected = pathId || items[0]?.id || ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    try {
      const data = await importer.mutateAsync({
        youtube_url: url.trim(),
        learning_path_id: selected,
      })
      setResult({ data, pathId: selected })
      setUrl('')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not add the video. Please try again.',
      )
    }
  }

  const pathTitle = items.find((p) => p.id === result?.pathId)?.title

  return (
    <Modal
      title="Add YouTube video"
      description="Paste a YouTube link to add it to one of your learning paths."
      onClose={onClose}
    >
      {paths.isPending ? (
        <p role="status" className="text-sm text-text-secondary">
          Loading your learning paths…
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            You need a learning path before you can add videos.
          </p>
          <Button
            onClick={() => {
              onClose()
              onCreatePath()
            }}
          >
            Create a learning path
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="YouTube video link"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-video-path" className="text-sm font-medium text-text-secondary">
              Learning path
            </label>
            <select
              id="add-video-path"
              value={selected}
              onChange={(e) => setPathId(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary"
            >
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <FormError message={error} />
          {result && (
            <p role="status" className="rounded-lg border border-success bg-surface-2 px-3 py-2 text-sm">
              {result.data.status === 'added' ? (
                <>
                  Added <strong>{result.data.video.title}</strong> to {pathTitle}.{' '}
                </>
              ) : (
                <>
                  <strong>{result.data.video.title}</strong> is already in {pathTitle}.{' '}
                </>
              )}
              {result.data.video.availability_state === 'embed_disabled' && (
                <>The owner has disabled embedding, so it can&apos;t be played here. </>
              )}
              <Link
                to={`/learning-paths/${result.pathId}`}
                onClick={onClose}
                className="font-medium underline"
              >
                Open path
              </Link>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Done
            </Button>
            <Button type="submit" disabled={importer.isPending || !url.trim()}>
              {importer.isPending ? 'Adding…' : 'Add video'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
