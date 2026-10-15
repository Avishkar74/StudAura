import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { ProgressBar } from '@/components/ProgressBar'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { PathPicker } from './PathPicker'
import { useLearningPaths } from './queries'
import { usePlaylistImport, type ImportState } from './usePlaylistImport'

interface PlaylistImportModalProps {
  onClose: () => void
  onCreatePath: () => void
  defaultPathId?: string
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function Summary({
  state,
  pathId,
  onClose,
}: {
  state: ImportState
  pathId: string
  onClose: () => void
}) {
  const failed = state.failedItems.length
  return (
    <div role="status" className="flex flex-col gap-2 text-sm">
      <p className="text-base font-semibold">
        {state.phase === 'done'
          ? `Imported ${plural(state.added, 'video', 'videos')}.`
          : `Imported ${plural(state.added, 'video', 'videos')} so far.`}
      </p>
      {failed > 0 && (
        <p className="text-text-secondary">{plural(failed, 'item', 'items')} could not be added.</p>
      )}
      {state.skipped > 0 && (
        <p className="text-text-secondary">
          {plural(state.skipped, 'video was', 'videos were')} already in this path.
        </p>
      )}
      {failed > 0 && (
        <details className="rounded-lg border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer font-medium">Show what couldn&apos;t be added</summary>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-text-secondary">
            {state.failedItems.map((item) => (
              <li key={item.youtube_video_id}>
                {item.title ?? item.youtube_video_id} — private, deleted or unavailable
              </li>
            ))}
          </ul>
        </details>
      )}
      {state.phase === 'done' && (
        <Link
          to={`/learning-paths/${pathId}`}
          onClick={onClose}
          className="mt-1 font-medium underline"
        >
          Open path
        </Link>
      )}
    </div>
  )
}

export function PlaylistImportModal({
  onClose,
  onCreatePath,
  defaultPathId,
}: PlaylistImportModalProps) {
  const paths = useLearningPaths()
  const { state, start, resume, requestStop, reset } = usePlaylistImport()
  const [url, setUrl] = useState('')
  const [pathId, setPathId] = useState(defaultPathId ?? '')

  const items = paths.data?.items ?? []
  const selected = pathId || items[0]?.id || ''
  const showProgress = state.phase !== 'idle' && (state.phase !== 'failed' || state.hasProgress)
  const running = state.phase === 'running'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    start(url.trim(), selected)
  }

  function close() {
    requestStop()
    onClose()
  }

  return (
    <Modal
      title="Import YouTube playlist"
      description="Add every available video from a public or unlisted playlist, in order."
      onClose={close}
    >
      {paths.isPending ? (
        <p role="status" className="text-sm text-text-secondary">
          Loading your learning paths…
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            You need a learning path before you can import a playlist.
          </p>
          <Button
            onClick={() => {
              close()
              onCreatePath()
            }}
          >
            Create a learning path
          </Button>
        </div>
      ) : showProgress ? (
        <div className="flex flex-col gap-4">
          {running && (
            <div className="flex flex-col gap-2">
              <p role="status" className="text-sm">
                Importing… {state.processed}
                {state.total !== null ? ` of ${state.total}` : ''} videos checked
              </p>
              <ProgressBar
                label="Playlist import progress"
                value={state.total ? (state.processed / state.total) * 100 : 0}
              />
            </div>
          )}

          {(state.added > 0 || state.failedItems.length > 0 || state.skipped > 0) && (
            <Summary state={state} pathId={selected} onClose={onClose} />
          )}
          {state.phase === 'done' && state.added === 0 && state.failedItems.length === 0 && (
            <p role="status" className="text-sm text-text-secondary">
              {state.skipped > 0 ? '' : 'This playlist has no videos to import.'}
            </p>
          )}

          {state.error && <FormError message={state.error} />}
          {state.phase === 'stopped' && (
            <p className="text-sm text-text-secondary">
              Stopped. You can continue where you left off.
            </p>
          )}

          <div className="flex justify-end gap-2">
            {running ? (
              <Button variant="secondary" onClick={requestStop}>
                Stop
              </Button>
            ) : (
              <>
                {(state.phase === 'failed' || state.phase === 'stopped') && (
                  <Button onClick={resume}>
                    {state.phase === 'failed' ? 'Try again' : 'Continue'}
                  </Button>
                )}
                <Button variant="secondary" onClick={close}>
                  {state.phase === 'done' ? 'Done' : 'Close'}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="YouTube playlist link"
            type="url"
            required
            placeholder="https://www.youtube.com/playlist?list=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (state.phase === 'failed') reset()
            }}
          />
          <PathPicker
            id="import-playlist-path"
            paths={items}
            value={selected}
            onChange={setPathId}
          />
          <FormError message={state.phase === 'failed' ? state.error : null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              Import playlist
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
