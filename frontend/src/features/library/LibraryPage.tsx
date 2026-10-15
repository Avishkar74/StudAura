import { BookmarkX, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import type { LearningStatus, SavedItem } from '@/api/types'
import type { SavedSort } from '@/api/library'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { StatusBadge } from '@/components/StatusBadge'
import { learnUrl, Thumbnail } from '@/features/dashboard/ContinueLearning'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatRelative } from '@/lib/time'
import { useSavedList, useSetSaved } from './queries'

const FILTERS: { label: string; status: LearningStatus | undefined }[] = [
  { label: 'All', status: undefined },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Completed', status: 'COMPLETED' },
  { label: 'Needs Revision', status: 'NEEDS_REVISION' },
]

const SORTS: { value: SavedSort; label: string }[] = [
  { value: 'saved', label: 'Recently saved' },
  { value: 'watched', label: 'Recently watched' },
]

function Row({ item }: { item: SavedItem }) {
  const remove = useSetSaved(item.video_id)
  const title = item.video.title
  const unavailable = item.video.availability_state !== 'available'
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-3 sm:flex-row sm:items-center">
      <Thumbnail
        src={item.video.thumbnail_url}
        className="aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:w-40"
      />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-semibold">{title}</h3>
        <p className="truncate text-sm text-text-secondary">
          {item.path ? item.path.title : 'Not in a path'}
          {item.video.channel_title ? ` · ${item.video.channel_title}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={item.learning_status} />
          {unavailable && <span className="text-xs text-warning">Can&apos;t be played here</span>}
          <span className="text-xs text-text-muted">
            {item.last_watched_at
              ? `Watched ${formatRelative(item.last_watched_at)}`
              : 'Not watched yet'}
            {' · '}Saved {formatRelative(item.saved_at)}
          </span>
        </div>
        {item.playback_pct !== null && item.playback_pct > 0 && (
          <ProgressBar
            className="mt-2 max-w-xs"
            value={item.playback_pct}
            label={`${title} playback`}
          />
        )}
        {remove.isError && (
          <p role="alert" className="mt-1 text-sm text-warning">
            Couldn&apos;t remove that bookmark. Try again.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={learnUrl(item)}
          aria-label={`Open ${title}`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-text-primary hover:bg-accent-hover"
        >
          <Play className="size-4" aria-hidden />
          Open
        </Link>
        <Button
          variant="secondary"
          aria-label={`Remove ${title} from saved videos`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(false)}
        >
          <BookmarkX className="mr-2 size-4" aria-hidden />
          Remove
        </Button>
      </div>
    </li>
  )
}

/** Bookmarked videos, separate from path membership (PRD 6.9). */
export function LibraryPage() {
  useDocumentTitle('Saved Videos')
  const [status, setStatus] = useState<LearningStatus | undefined>(undefined)
  const [sort, setSort] = useState<SavedSort>('saved')
  const list = useSavedList(status, sort)
  const filterLabel = FILTERS.find((f) => f.status === status)?.label ?? 'All'

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Saved Videos</h1>
        <p className="mt-1 text-text-secondary">Videos you bookmarked to return to.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={f.status === status}
              onClick={() => setStatus(f.status)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                f.status === status
                  ? 'border-accent bg-surface-2 text-text-primary'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="saved-sort" className="text-sm text-text-secondary">
            Sort by
          </label>
          <select
            id="saved-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SavedSort)}
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

      {list.isPending && (
        <div role="status" aria-label="Loading saved videos" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border bg-surface-1"
            />
          ))}
        </div>
      )}

      {list.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-semibold">We couldn&apos;t load your saved videos.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check your connection and try again. Nothing has been lost.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {list.isSuccess && list.data.items.length === 0 && (
        <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
          {status === undefined ? (
            <>
              <h2 className="text-xl font-semibold">Nothing saved yet.</h2>
              <p className="max-w-md text-text-secondary">
                Save videos you want to return to. They&apos;ll appear here. Use the Save button on
                a video&apos;s page.
              </p>
            </>
          ) : (
            <h2 className="text-xl font-semibold">
              No saved videos are {filterLabel.toLowerCase()}.
            </h2>
          )}
        </section>
      )}

      {list.isSuccess && list.data.items.length > 0 && (
        <>
          <p className="text-sm text-text-secondary">
            {list.data.total} saved {list.data.total === 1 ? 'video' : 'videos'}
            {status !== undefined && ` · ${filterLabel}`}
          </p>
          <ul className="flex flex-col gap-3">
            {list.data.items.map((item) => (
              <Row key={item.video_id} item={item} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
