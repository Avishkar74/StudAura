import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LearningStatus } from '@/api/types'
import { ProgressBar } from '@/components/ProgressBar'
import { StatusBadge } from '@/components/StatusBadge'
import { useGoal } from '@/features/goals/queries'
import { usePath } from './queries'
import { formatMinutes, formatRelative, formatTimestamp } from '@/lib/time'

export interface ProgressPanelProps {
  durationSeconds: number | null
  /** Where the player is right now; follows playback. */
  position: number
  /** The last position the server has saved (the resume point). */
  savedPosition: number
  playing: boolean
  status: LearningStatus
  lastWatchedAt: string | null
  /** The learning path this video was opened from, if any. */
  pathId?: string
  /** This video's place in the path (1-based). */
  pathPosition?: number
  next?: { to: string; title: string }
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-surface-2 p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 flex flex-col gap-2 text-sm">{children}</div>
    </section>
  )
}

function ThisVideo({
  durationSeconds,
  position,
  savedPosition,
  playing,
  status,
  lastWatchedAt,
}: ProgressPanelProps) {
  const hasLength = durationSeconds !== null && durationSeconds > 0
  const pct = hasLength ? Math.min(100, (position / durationSeconds) * 100) : null
  const left = hasLength ? Math.max(0, durationSeconds - position) : null

  return (
    <Block title="This video">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 text-xs ${playing ? 'text-success' : 'text-text-muted'}`}
        >
          <span
            aria-hidden
            className={`size-2 rounded-full ${playing ? 'animate-pulse bg-success' : 'bg-surface-3'}`}
          />
          {playing ? 'Playing' : 'Paused'}
        </span>
      </div>
      {pct !== null ? (
        <>
          <ProgressBar value={pct} label="Video progress" />
          <p className="text-text-secondary">
            <span className="font-medium text-text-primary">{formatTimestamp(position)}</span> of{' '}
            {formatTimestamp(durationSeconds ?? 0)} · {Math.round(pct)}%
            {left !== null && left > 0 && <span> · {formatTimestamp(left)} left</span>}
          </p>
        </>
      ) : (
        <p className="text-text-secondary">
          At <span className="font-medium text-text-primary">{formatTimestamp(position)}</span>
        </p>
      )}
      <p className="text-xs text-text-muted">
        {savedPosition > 0
          ? `Resume point saved at ${formatTimestamp(savedPosition)}`
          : 'No resume point saved yet'}
        {lastWatchedAt && ` · Last watched ${formatRelative(lastWatchedAt)}`}
      </p>
    </Block>
  )
}

function TodaysGoal() {
  const goal = useGoal()
  if (goal.isPending) {
    return (
      <Block title="Today's goal">
        <p className="text-text-secondary">Loading…</p>
      </Block>
    )
  }
  if (goal.isError) {
    return (
      <Block title="Today's goal">
        <p className="text-warning">Couldn&apos;t load today&apos;s goal.</p>
      </Block>
    )
  }
  const { daily_target_minutes: target, today_watched_seconds: watched } = goal.data
  const watchedMinutes = Math.floor(watched / 60)
  if (target === null) {
    return (
      <Block title="Today's goal">
        <p className="text-text-secondary">
          Watched today:{' '}
          <strong className="text-text-primary">{formatMinutes(watchedMinutes)}</strong>.{' '}
          <Link to="/goals" className="underline">
            Set a daily goal
          </Link>
        </p>
      </Block>
    )
  }
  const targetSeconds = target * 60
  const remainingMinutes = Math.max(0, Math.ceil((targetSeconds - watched) / 60))
  return (
    <Block title="Today's goal">
      <ProgressBar value={(watched / targetSeconds) * 100} label="Today's viewing goal" />
      <p className="text-text-secondary">
        <strong className="text-text-primary">{watchedMinutes}</strong> / {target} min
        {goal.data.goal_achieved ? (
          <span className="text-success"> · Goal reached</span>
        ) : (
          <span> · {formatMinutes(remainingMinutes)} to go</span>
        )}
      </p>
    </Block>
  )
}

function ThisPath({
  pathId,
  pathPosition,
  next,
}: {
  pathId: string
  pathPosition?: number
  next?: { to: string; title: string }
}) {
  const path = usePath(pathId)
  if (path.isPending) {
    return (
      <Block title="Learning path">
        <p className="text-text-secondary">Loading…</p>
      </Block>
    )
  }
  if (path.isError) {
    return (
      <Block title="Learning path">
        <p className="text-warning">Couldn&apos;t load the path&apos;s progress.</p>
      </Block>
    )
  }
  const p = path.data
  return (
    <Block title="Learning path">
      <Link to={`/learning-paths/${p.id}`} className="font-medium hover:underline">
        {p.title}
      </Link>
      <ProgressBar value={p.completion_pct} label={`${p.title} progress`} />
      <p className="text-text-secondary">
        {p.completed_videos} of {p.total_videos} completed · {Math.round(p.completion_pct)}%
      </p>
      <p className="text-xs text-text-muted">
        {pathPosition !== undefined && `Video ${pathPosition} of ${p.total_videos} · `}
        {p.in_progress_videos} in progress · {p.needs_revision_videos} need revision
      </p>
      {next && (
        <Link
          to={next.to}
          className="inline-flex items-center gap-2 text-text-primary underline-offset-2 hover:underline"
        >
          Up next: <span className="line-clamp-1 text-text-secondary">{next.title}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </Block>
  )
}

/**
 * The Progress tab: where you are in this video right now (it follows playback), your resume
 * point, today's goal and how far through the learning path you are. Everything but the live
 * position comes from the server and refreshes while you watch.
 */
export function ProgressPanel(props: ProgressPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <ThisVideo {...props} />
      <TodaysGoal />
      {props.pathId && (
        <ThisPath pathId={props.pathId} pathPosition={props.pathPosition} next={props.next} />
      )}
    </div>
  )
}
