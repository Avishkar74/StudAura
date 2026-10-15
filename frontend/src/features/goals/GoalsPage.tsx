import { Play, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PathDeadline } from '@/api/types'
import { Button } from '@/components/Button'
import { learnUrl, Thumbnail } from '@/features/dashboard/ContinueLearning'
import { useDashboardLearning } from '@/features/dashboard/queries'
import { useRevisionQueue } from '@/features/revisions/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate, formatDue, formatDuration } from '@/lib/time'
import { GoalPanel } from './GoalPanel'
import { useDeadlines, useGoal } from './queries'
import { WeeklySummary } from './WeeklySummary'

function Section({
  title,
  id,
  children,
}: {
  title: string
  id: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 id={id} className="mb-3 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** "≈ 2 h a day", "≈ 36 min a day", "< 1 min a day". */
function perDay(minutes: number): string {
  return minutes < 1 ? '< 1 min' : formatDuration(Math.round(minutes) * 60)
}

function DeadlineRow({ d }: { d: PathDeadline }) {
  const left =
    d.days_remaining < 0
      ? `Target date passed ${-d.days_remaining} ${d.days_remaining === -1 ? 'day' : 'days'} ago`
      : d.days_remaining === 0
        ? 'Target date is today'
        : `${d.days_remaining} ${d.days_remaining === 1 ? 'day' : 'days'} left`
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-surface-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link to={`/learning-paths/${d.path_id}`} className="font-medium hover:underline">
          {d.title}
        </Link>
        <span className="text-sm text-text-secondary">
          Target {formatDate(d.target_date)} · {left}
        </span>
      </div>
      <p className="text-sm text-text-secondary">
        {formatDuration(d.remaining_seconds)} left across {d.remaining_videos}{' '}
        {d.remaining_videos === 1 ? 'video' : 'videos'}
        {d.minutes_per_day !== null && (
          <>
            {' '}
            · <strong className="text-text-primary">
              ≈ {perDay(d.minutes_per_day)} a day
            </strong>{' '}
            (estimate)
          </>
        )}
      </p>
      {d.videos_without_duration > 0 && (
        <p className="text-xs text-text-muted">
          {d.videos_without_duration}{' '}
          {d.videos_without_duration === 1 ? 'video has' : 'videos have'} no known length, so{' '}
          {d.videos_without_duration === 1 ? "it isn't" : "they aren't"} included.
        </p>
      )}
    </li>
  )
}

/** Today's goal, the week so far, what to watch, and the pace each target date needs (PRD 6.6). */
export function GoalsPage() {
  useDocumentTitle('Daily Goals')
  const goal = useGoal()
  const deadlines = useDeadlines()
  const learning = useDashboardLearning()
  const revisions = useRevisionQueue()

  const resume = learning.data?.continue_learning ?? null
  const due = (revisions.data?.items ?? []).filter((i) => i.due_state !== 'upcoming')

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Daily Goals</h1>
        <p className="mt-1 text-text-secondary">
          Set a daily viewing target and track your progress.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Today's goal" id="goal-today">
          <GoalPanel />
        </Section>
        <Section title="This week" id="goal-week">
          {goal.isPending ? (
            <p className="text-sm text-text-secondary">Loading…</p>
          ) : goal.isError ? (
            <p className="text-sm text-text-secondary">
              We couldn&apos;t load your week. Your tracked time is safe.
            </p>
          ) : (
            <WeeklySummary days={goal.data.daily} targetMinutes={goal.data.daily_target_minutes} />
          )}
        </Section>
      </div>

      <Section title="Up next today" id="goal-plan">
        {learning.isPending || revisions.isPending ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : !resume && due.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Nothing is waiting for you. Pick a video from one of your{' '}
            <Link to="/learning-paths" className="text-text-primary underline">
              learning paths
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resume && (
              <li>
                <Link
                  to={learnUrl(resume)}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 p-2 hover:bg-surface-3"
                >
                  <Thumbnail
                    src={resume.video.thumbnail_url}
                    className="aspect-video w-24 shrink-0 overflow-hidden rounded"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{resume.video.title}</span>
                    <span className="block truncate text-xs text-text-muted">
                      Continue · {resume.path?.title ?? 'Saved video'}
                      {resume.playback_pct !== null &&
                        ` · ${Math.round(resume.playback_pct)}% watched`}
                    </span>
                  </span>
                  <Play className="size-4 shrink-0 text-accent" aria-hidden />
                </Link>
              </li>
            )}
            {due.map((item) => (
              <li key={item.video_id}>
                <Link
                  to={learnUrl(item)}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 p-2 hover:bg-surface-3"
                >
                  <Thumbnail
                    src={item.video.thumbnail_url}
                    className="aspect-video w-24 shrink-0 overflow-hidden rounded"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.video.title}</span>
                    <span className="block truncate text-xs text-text-muted">
                      Revision · {formatDue(item.due_at, revisions.data?.today ?? item.due_at)} ·{' '}
                      {item.path?.title ?? 'Saved video'}
                    </span>
                  </span>
                  <RotateCcw className="size-4 shrink-0 text-revision" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Learning-path deadlines" id="goal-deadlines">
        {deadlines.isPending ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : deadlines.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-warning">Couldn&apos;t load your deadlines.</p>
            <Button variant="secondary" onClick={() => void deadlines.refetch()}>
              Try again
            </Button>
          </div>
        ) : deadlines.data.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Give a learning path a target date to see how much to watch each day to finish in time.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {deadlines.data.map((d) => (
                <DeadlineRow key={d.path_id} d={d} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-text-muted">
              Estimates divide the length of the videos you haven&apos;t completed by the days left.
              They are a guide, not a promise.
            </p>
          </>
        )}
      </Section>
    </div>
  )
}
