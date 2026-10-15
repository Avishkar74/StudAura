import { ExternalLink, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listNotes } from '@/api/library'
import { Button } from '@/components/Button'
import { learnUrl } from '@/features/dashboard/ContinueLearning'
import { useLearningPaths } from '@/features/learning-paths/queries'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatRelative } from '@/lib/time'
import { useQuery } from '@tanstack/react-query'

const LIMIT = 100

/** Every note in one searchable list, with a path filter (PRD 6.8). */
export function NotesPage() {
  useDocumentTitle('My Notes')
  const [text, setText] = useState('')
  const [pathId, setPathId] = useState('')
  const q = useDebouncedValue(text.trim(), 300)
  const paths = useLearningPaths()
  const notes = useQuery({
    queryKey: ['notes', 'list', q, pathId],
    queryFn: () => listNotes({ q: q || undefined, pathId: pathId || undefined, limit: LIMIT }),
    staleTime: 0,
    placeholderData: (previous) => previous, // keep the list on screen while typing
  })
  const filtered = q !== '' || pathId !== ''

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Notes</h1>
        <p className="mt-1 text-text-secondary">Every note you&apos;ve written, in one place.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <label htmlFor="notes-search" className="sr-only">
            Search notes
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            id="notes-search"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search your notes"
            maxLength={100}
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-3 pl-9 text-text-primary placeholder:text-text-muted"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="notes-path" className="text-sm text-text-secondary">
            Path
          </label>
          <select
            id="notes-path"
            value={pathId}
            onChange={(e) => setPathId(e.target.value)}
            className="max-w-56 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary"
          >
            <option value="">All paths</option>
            {(paths.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notes.isPending && (
        <div role="status" aria-label="Loading your notes" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border bg-surface-1"
            />
          ))}
        </div>
      )}

      {notes.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-semibold">We couldn&apos;t load your notes.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check your connection and try again. Your notes are safe.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void notes.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {notes.isSuccess && notes.data.items.length === 0 && (
        <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
          {filtered ? (
            <>
              <h2 className="text-xl font-semibold">No notes match.</h2>
              <p className="max-w-md text-text-secondary">
                Try a different word or path, or clear the filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setText('')
                  setPathId('')
                }}
                className="text-text-primary underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">You haven&apos;t written any notes yet.</h2>
              <p className="max-w-md text-text-secondary">
                Open a video and use the Notes tab. Your notes will appear here.
              </p>
            </>
          )}
        </section>
      )}

      {notes.isSuccess && notes.data.items.length > 0 && (
        <>
          <p aria-live="polite" className="text-sm text-text-secondary">
            {notes.data.total} {notes.data.total === 1 ? 'note' : 'notes'}
            {notes.data.total > notes.data.items.length &&
              ` · showing the ${notes.data.items.length} most recently edited`}
          </p>
          <ul className="flex flex-col gap-3">
            {notes.data.items.map((n) => (
              <li
                key={n.video_id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-1 font-semibold">{n.title}</h3>
                  <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{n.snippet}</p>
                  <p className="mt-2 truncate text-xs text-text-muted">
                    {n.video.title} · {n.path ? n.path.title : 'Not in a path'} · Edited{' '}
                    {formatRelative(n.updated_at)}
                    {n.video.availability_state !== 'available' && (
                      <span className="text-warning"> · Video unavailable</span>
                    )}
                  </p>
                </div>
                <Link
                  to={learnUrl(n)}
                  aria-label={`Open video ${n.video.title}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
                >
                  <ExternalLink className="size-4" aria-hidden />
                  Open video
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
