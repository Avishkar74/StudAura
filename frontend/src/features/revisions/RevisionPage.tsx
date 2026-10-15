import { CalendarClock, CircleCheck, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type { DueState, RevisionItem } from '@/api/types'
import { Button } from '@/components/Button'
import { learnUrl, Thumbnail } from '@/features/dashboard/ContinueLearning'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDue } from '@/lib/time'
import { RescheduleDialog } from './RescheduleDialog'
import { revisionKeys, useCompleteRevision, useRevisionQueue } from './queries'

type Sort = 'due' | 'flagged' | 'title'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'flagged', label: 'Recently flagged' },
  { value: 'title', label: 'Title' },
]

const GROUPS: { state: DueState; label: string }[] = [
  { state: 'overdue', label: 'Overdue' },
  { state: 'due_today', label: 'Due today' },
  { state: 'upcoming', label: 'Upcoming' },
]

/** Within a group the server already orders by due date, then most recently flagged. */
function sorted(items: RevisionItem[], sort: Sort): RevisionItem[] {
  const copy = [...items]
  if (sort === 'flagged') copy.sort((a, b) => b.flagged_at.localeCompare(a.flagged_at))
  if (sort === 'title') copy.sort((a, b) => a.video.title.localeCompare(b.video.title))
  return copy
}

function Row({ item, today }: { item: RevisionItem; today: string }) {
  const qc = useQueryClient()
  const complete = useCompleteRevision(item.video_id)
  const [rescheduling, setRescheduling] = useState(false)
  const title = item.video.title

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-3 sm:flex-row sm:items-center">
      <Thumbnail
        src={item.video.thumbnail_url}
        className="aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:w-36"
      />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-semibold">{title}</h3>
        <p className="truncate text-sm text-text-secondary">{item.path?.title ?? 'Saved video'}</p>
        <p
          className={`mt-1 inline-flex items-center gap-1.5 text-sm font-medium ${
            item.due_state === 'overdue' ? 'text-warning' : 'text-revision'
          }`}
        >
          <RotateCcw className="size-4" aria-hidden />
          {formatDue(item.due_at, today)}
        </p>
        {complete.isError &&
          !(complete.error instanceof ApiError && complete.error.status === 404) && (
            <p role="alert" className="mt-1 text-sm text-warning">
              Couldn&apos;t mark that revised. Try again.
            </p>
          )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={learnUrl(item)}
          aria-label={`Review ${title} now`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-text-primary hover:bg-accent-hover"
        >
          <Play className="size-4" aria-hidden />
          Review now
        </Link>
        <Button
          variant="secondary"
          aria-label={`Reschedule ${title}`}
          onClick={() => setRescheduling(true)}
        >
          <CalendarClock className="mr-2 size-4" aria-hidden />
          Reschedule
        </Button>
        <Button
          variant="secondary"
          aria-label={`Mark ${title} revised`}
          disabled={complete.isPending}
          onClick={() =>
            complete.mutate(undefined, {
              // Already revised in another tab: the list is simply out of date.
              onError: (err) =>
                err instanceof ApiError &&
                err.status === 404 &&
                void qc.invalidateQueries({ queryKey: revisionKeys.queue }),
            })
          }
        >
          <CircleCheck className="mr-2 size-4" aria-hidden />
          Mark revised
        </Button>
      </div>
      {rescheduling && (
        <RescheduleDialog
          videoId={item.video_id}
          title={title}
          today={today}
          dueAt={item.due_at}
          onClose={() => setRescheduling(false)}
        />
      )}
    </li>
  )
}

/** The revision queue: overdue, due today and upcoming (PRD 6.7). */
export function RevisionPage() {
  useDocumentTitle('Needs Revision')
  const queue = useRevisionQueue()
  const [sort, setSort] = useState<Sort>('due')

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Needs Revision</h1>
          <p className="mt-1 text-text-secondary">
            Videos you marked for revision, ordered by due date.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="revision-sort" className="text-sm text-text-secondary">
            Sort by
          </label>
          <select
            id="revision-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
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

      {queue.isPending && (
        <div role="status" aria-label="Loading your revisions" className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border bg-surface-1"
            />
          ))}
        </div>
      )}

      {queue.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-semibold">We couldn&apos;t load your revisions.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check your connection and try again. Nothing has been lost.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void queue.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {queue.isSuccess && queue.data.items.length === 0 && (
        <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">You&apos;re all caught up.</h2>
          <p className="max-w-md text-text-secondary">
            Mark a video for revision whenever you want to revisit it.
          </p>
        </section>
      )}

      {queue.isSuccess &&
        GROUPS.map(({ state, label }) => {
          const group = sorted(
            queue.data.items.filter((i) => i.due_state === state),
            sort,
          )
          if (group.length === 0) return null
          return (
            <section key={state} aria-labelledby={`revisions-${state}`}>
              <h2 id={`revisions-${state}`} className="mb-3 text-lg font-semibold">
                {label} <span className="text-text-muted">({group.length})</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {group.map((item) => (
                  <Row key={item.video_id} item={item} today={queue.data.today} />
                ))}
              </ul>
            </section>
          )
        })}
    </div>
  )
}
