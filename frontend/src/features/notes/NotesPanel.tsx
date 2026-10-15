import type { Editor } from '@tiptap/react'
import { Upload } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import { Button } from '@/components/Button'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useAuth } from '@/features/auth/useAuth'
import { loadDraft, clearDraft, type Draft } from './drafts'
import { SaveStatus } from './SaveStatus'
import { UploadNotesModal } from './UploadNotesModal'
import { useNoteAutosave } from './useNoteAutosave'
import { useNote } from './queries'
import type { Note } from '@/api/types'

// The rich-text editor is large; load it only when a note is actually opened.
const NotesEditor = lazy(() => import('./NotesEditor').then((m) => ({ default: m.NotesEditor })))

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'earlier' : date.toLocaleString()
}

/** The editor and its save machinery. Mounted only once the saved note has loaded. */
function LoadedNotes({
  videoId,
  note,
  onEditor,
  debounceMs,
}: {
  videoId: string
  note: Note
  onEditor?: (e: Editor) => void
  debounceMs?: number
}) {
  const { user } = useAuth()
  const userId = user?.id ?? 'unknown'
  const autosave = useNoteAutosave({ videoId, userId, initial: note, debounceMs })
  const editor = useRef<Editor | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  function onLoaded(html: string, e: Editor) {
    editor.current = e
    autosave.markLoaded(html)
    onEditor?.(e)
    // Text that was typed but never saved (a failed save, a closed tab) is offered back.
    const found = loadDraft(userId, videoId)
    if (found && found.body !== html) setDraft(found)
    else if (found) clearDraft(userId, videoId)
  }

  function restoreDraft() {
    if (!draft || !editor.current) return
    editor.current.commands.setContent(draft.body, { emitUpdate: true })
    setDraft(null)
  }

  function discardDraft() {
    clearDraft(userId, videoId)
    setDraft(null)
  }

  function useSavedVersion() {
    const body = autosave.adoptSaved()
    editor.current?.commands.setContent(body, { emitUpdate: false })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {draft && (
        <div
          role="region"
          aria-label="Unsaved changes found"
          className="rounded-xl border border-border bg-surface-1 p-3 text-sm"
        >
          <p>
            Unsaved changes from <strong>{formatWhen(draft.savedAt)}</strong> were found on this
            device.
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={restoreDraft}>Restore</Button>
            <Button variant="secondary" onClick={discardDraft}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {autosave.state === 'conflict' && (
        <div role="alert" className="rounded-xl border border-warning bg-surface-1 p-3 text-sm">
          <p className="font-semibold">
            This note was changed in another tab or on another device.
          </p>
          <p className="mt-1 text-text-secondary">
            Your text is still here and has not been saved. Choose which version to keep.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={autosave.keepMine}>Keep my version</Button>
            <Button variant="secondary" onClick={useSavedVersion}>
              Use the saved version
            </Button>
          </div>
        </div>
      )}

      <Suspense fallback={<FullPageSpinner />}>
        <NotesEditor initialHtml={note.body} onChange={autosave.onChange} onLoaded={onLoaded} />
      </Suspense>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SaveStatus
          state={autosave.state}
          lastSavedAt={autosave.lastSavedAt}
          errorMessage={autosave.errorMessage}
          onRetry={autosave.retry}
        />
        <Button variant="secondary" onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="size-4" aria-hidden />
          Upload Notes (Coming soon)
        </Button>
      </div>

      {uploadOpen && <UploadNotesModal onClose={() => setUploadOpen(false)} />}
    </div>
  )
}

/** The Notes tab of the workspace: one typed note per video, saved automatically. */
export function NotesPanel({
  videoId,
  onEditor,
  debounceMs,
}: {
  videoId: string
  onEditor?: (e: Editor) => void
  debounceMs?: number
}) {
  const note = useNote(videoId)

  if (note.isPending) return <FullPageSpinner />
  if (note.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 text-sm">
        <p className="font-semibold">Couldn&apos;t load your note.</p>
        <p className="text-text-secondary">
          Your note is safe. Check your connection and try again.
        </p>
        <Button variant="secondary" onClick={() => void note.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <LoadedNotes
      key={videoId}
      videoId={videoId}
      note={note.data}
      onEditor={onEditor}
      debounceMs={debounceMs}
    />
  )
}
