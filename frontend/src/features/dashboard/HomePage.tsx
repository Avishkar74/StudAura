import { BookOpen, CircleCheck, Clock, RotateCcw, Target, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useShell } from '@/app/shell/shellContext'
import { Button } from '@/components/Button'
import type { LearningItem } from '@/api/types'
import { useMe } from '@/features/auth/queries'
import { GoalPanel } from '@/features/goals/GoalPanel'
import { useGoal } from '@/features/goals/queries'
import { useLearningPaths } from '@/features/learning-paths/queries'
import { useRevisionQueue } from '@/features/revisions/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDue, formatDuration, formatRelative, greetingFor } from '@/lib/time'
import { ContinueLearning, learnUrl, Thumbnail } from './ContinueLearning'
import { PathCard } from './PathCard'
import { useDashboardLearning } from './queries'

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon
  label: string
  value: string
  caption: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-1 p-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="truncate text-xs text-text-muted">{caption}</p>
      </div>
    </div>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-accent" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** The most urgent revisions, each opening its video in the workspace (PRD 6.2). */
function RevisionPreview() {
  const queue = useRevisionQueue()
  if (queue.isPending) return <p className="text-sm text-text-secondary">Loading revisions…</p>
  if (queue.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="text-warning">Couldn&apos;t load your revisions.</p>
        <Button variant="secondary" onClick={() => void queue.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  const { items, today, total } = queue.data
  if (items.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        You&apos;re all caught up. Mark a video for revision whenever you want to revisit it.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {items.slice(0, 3).map((item) => (
          <li key={item.video_id}>
            <Link
              to={
                item.path
                  ? `/learn/${item.path.id}/${item.video_id}`
                  : `/learn/saved/${item.video_id}`
              }
              className="block rounded-lg bg-surface-2 p-3 hover:bg-surface-3"
            >
              <span className="block truncate text-sm font-medium">{item.video.title}</span>
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-text-muted">
                  {item.path?.title ?? 'Saved video'}
                </span>
                <span
                  className={item.due_state === 'overdue' ? 'text-warning' : 'text-text-secondary'}
                >
                  {formatDue(item.due_at, today)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/revision" className="text-sm text-text-secondary hover:text-text-primary">
        View all{total > 3 ? ` ${total}` : ''}
      </Link>
    </div>
  )
}

/** Compact rows of the latest watched videos, for a quick return. */
function RecentlyWatched({
  items,
  loading,
  failed,
}: {
  items: LearningItem[]
  loading: boolean
  failed: boolean
}) {
  if (loading) return <p className="text-sm text-text-secondary">Loading…</p>
  if (failed) {
    return <p className="text-sm text-text-secondary">We couldn&apos;t load your recent videos.</p>
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        Videos you watch will show up here so you can jump back in.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.slice(0, 4).map((item) => (
        <li key={item.video_id}>
          <Link
            to={learnUrl(item)}
            className="flex items-center gap-3 rounded-lg bg-surface-2 p-2 hover:bg-surface-3"
          >
            <Thumbnail
              src={item.video.thumbnail_url}
              className="aspect-video w-20 shrink-0 overflow-hidden rounded"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{item.video.title}</span>
              <span className="block truncate text-xs text-text-muted">
                {item.path?.title ?? 'Saved video'} · {formatRelative(item.last_watched_at)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Skeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your dashboard"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-surface-1" />
      ))}
    </div>
  )
}

export function HomePage() {
  useDocumentTitle('Home')
  const { openCreatePath } = useShell()
  const me = useMe()
  const paths = useLearningPaths()
  const goal = useGoal()
  const revisions = useRevisionQueue()
  const learning = useDashboardLearning()

  const items = paths.data?.items ?? []
  const name = me.data?.display_name || me.data?.email.split('@')[0] || ''

  const totalVideos = items.reduce((n, p) => n + p.total_videos, 0)
  const completedVideos = items.reduce((n, p) => n + p.completed_videos, 0)
  const activePaths = items.filter(
    (p) => p.total_videos === 0 || p.completed_videos < p.total_videos,
  ).length

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <p className="text-text-secondary">
          {greetingFor()}
          {name ? `, ${name}` : ''}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Ready to <span className="text-accent">learn</span> today?
        </h1>
        <p className="mt-1 text-text-secondary">
          Consistent learning today builds the skills for tomorrow.
        </p>
      </div>

      {paths.isPending && <Skeleton />}

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
          <h2 className="text-xl font-semibold">Your learning workspace starts here.</h2>
          <p className="max-w-md text-text-secondary">
            A learning path groups the videos and playlists you want to learn together. Create your
            first one, then add YouTube videos to it.
          </p>
          <Button onClick={openCreatePath}>Create a learning path</Button>
        </section>
      )}

      {paths.isSuccess && items.length > 0 && (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={BookOpen}
              label="Active Learning Paths"
              value={String(activePaths)}
              caption={`${items.length} in total`}
            />
            <MetricCard
              icon={CircleCheck}
              label="Videos Completed"
              value={String(completedVideos)}
              caption={`out of ${totalVideos} videos`}
            />
            <MetricCard
              icon={Clock}
              label="Learning Time"
              value={goal.data ? formatDuration(goal.data.today_watched_seconds) : '—'}
              caption={
                goal.data
                  ? `${formatDuration(goal.data.week_watched_seconds)} this week`
                  : goal.isError
                    ? "Couldn't load"
                    : 'Loading…'
              }
            />
            <MetricCard
              icon={RotateCcw}
              label="Needs Revision"
              value={revisions.data ? String(revisions.data.total) : '—'}
              caption={
                revisions.data
                  ? revisions.data.total === 0
                    ? 'all caught up'
                    : `${revisions.data.due_count} due`
                  : revisions.isError
                    ? "Couldn't load"
                    : 'Loading…'
              }
            />
          </section>

          <section aria-labelledby="continue-heading">
            <h2 id="continue-heading" className="mb-3 text-xl font-semibold">
              Continue Learning
            </h2>
            {learning.data?.continue_learning ? (
              <ContinueLearning item={learning.data.continue_learning} />
            ) : learning.isPending ? (
              <div className="h-40 animate-pulse rounded-xl border border-border bg-surface-1" />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-surface-1 p-5 text-sm text-text-secondary">
                {learning.isError
                  ? "We couldn't load where you left off. Your progress is safe."
                  : "You're not partway through a video. Open a learning path and press play on one."}{' '}
                <Link to="/learning-paths" className="text-text-primary underline">
                  Browse paths
                </Link>
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Today's Goals" icon={Target}>
              <GoalPanel />
            </Panel>
            <Panel title="Upcoming Revisions" icon={RotateCcw}>
              <RevisionPreview />
            </Panel>
            <Panel title="Recently Watched" icon={Clock}>
              <RecentlyWatched
                items={(learning.data?.recently_watched ?? []).filter(
                  (i) => i.video_id !== learning.data?.continue_learning?.video_id,
                )}
                loading={learning.isPending}
                failed={learning.isError}
              />
            </Panel>
          </div>

          <section aria-labelledby="paths-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="paths-heading" className="text-xl font-semibold">
                Your Learning Paths
              </h2>
              <Link
                to="/learning-paths"
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.slice(0, 4).map((p, i) => (
                // The fourth card only shows where four columns fit, so no row is left lopsided.
                <div key={p.id} className={i === 3 ? 'hidden 2xl:block' : undefined}>
                  <PathCard path={p} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
