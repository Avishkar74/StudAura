import { FolderPlus, ListPlus, Plus, Video, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { LearningPath, PathSort } from '@/api/types'
import { useShell } from '@/app/shell/shellContext'
import { Button } from '@/components/Button'
import { PathCard } from '@/features/dashboard/PathCard'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { DeletePathDialog } from './DeletePathDialog'
import { PathFormModal } from './PathFormModal'
import { usePathList } from './queries'

const SORTS: { value: PathSort; label: string }[] = [
  { value: 'recent', label: 'Recently active' },
  { value: 'name', label: 'Name' },
  { value: 'progress', label: 'Progress' },
  { value: 'target_date', label: 'Target date' },
]

function isSort(value: string | null): value is PathSort {
  return SORTS.some((s) => s.value === value)
}

/** Every learning path, sortable and searchable (PRD 6.3). The search comes from the header box. */
export function AllPathsPage() {
  useDocumentTitle('All Learning Paths')
  const { openCreatePath, openAddVideo, openImportPlaylist } = useShell()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const sortParam = params.get('sort')
  const sort: PathSort = isSort(sortParam) ? sortParam : 'recent'
  const paths = usePathList(sort, q)
  const [editing, setEditing] = useState<LearningPath | null>(null)
  const [deleting, setDeleting] = useState<LearningPath | null>(null)

  function setSort(next: PathSort) {
    const copy = new URLSearchParams(params)
    if (next === 'recent') copy.delete('sort')
    else copy.set('sort', next)
    setParams(copy, { replace: true })
  }

  const items = paths.data?.items ?? []

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">All Learning Paths</h1>
          <p className="mt-1 text-text-secondary">
            Manage and explore all your learning paths in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreatePath}>
            <FolderPlus className="mr-2 size-4" aria-hidden />
            Create Learning Path
          </Button>
          <Button variant="secondary" onClick={() => openAddVideo()}>
            <Video className="mr-2 size-4" aria-hidden />
            Add Video
          </Button>
          <Button variant="secondary" onClick={() => openImportPlaylist()}>
            <ListPlus className="mr-2 size-4" aria-hidden />
            Import Playlist
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          {q ? (
            <>
              <span>
                Results for <strong className="text-text-primary">&ldquo;{q}&rdquo;</strong>
              </span>
              <Link
                to="/learning-paths"
                aria-label="Clear search"
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 hover:text-text-primary"
              >
                <X className="size-3.5" aria-hidden />
                Clear
              </Link>
            </>
          ) : (
            paths.data && (
              <span>
                {paths.data.total} {paths.data.total === 1 ? 'path' : 'paths'}
              </span>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="path-sort" className="text-sm text-text-secondary">
            Sort by
          </label>
          <select
            id="path-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as PathSort)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {paths.isPending && (
        <div
          role="status"
          aria-label="Loading your learning paths"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-border bg-surface-1"
            />
          ))}
        </div>
      )}

      {paths.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-semibold">We couldn&apos;t load your learning paths.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check your connection and try again. Nothing has been lost.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void paths.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {paths.isSuccess && items.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
          {q ? (
            <>
              <h2 className="text-xl font-semibold">No paths match &ldquo;{q}&rdquo;.</h2>
              <p className="max-w-md text-text-secondary">
                Try a different word, or clear the search to see all your paths.
              </p>
              <Link to="/learning-paths" className="text-text-primary underline">
                Clear search
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">You don&apos;t have a learning path yet.</h2>
              <p className="max-w-md text-text-secondary">
                A learning path groups the videos and playlists you want to learn together. Create
                one, then add YouTube videos to it.
              </p>
              <Button onClick={openCreatePath}>
                <Plus className="mr-2 size-4" aria-hidden />
                Create a learning path
              </Button>
            </>
          )}
        </section>
      )}

      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <PathCard path={p} onEdit={setEditing} onDelete={setDeleting} />
            </li>
          ))}
        </ul>
      )}
      {editing && <PathFormModal path={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeletePathDialog path={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}
