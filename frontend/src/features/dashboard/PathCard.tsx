import { FolderOpen, GraduationCap, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LearningPath } from '@/api/types'
import { ProgressBar } from '@/components/ProgressBar'
import { formatRelative } from '@/lib/time'

export function PathCard({ path }: { path: LearningPath }) {
  const started = path.completed_videos > 0 || path.in_progress_videos > 0 || path.last_activity_at
  const Icon = started ? Play : FolderOpen

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold">{path.title}</h3>
          <p className="text-sm text-text-secondary">
            {path.total_videos} {path.total_videos === 1 ? 'video' : 'videos'}
          </p>
        </div>
      </div>

      <div>
        <ProgressBar value={path.completion_pct} label={`${path.title} progress`} />
        <div className="mt-1.5 flex justify-between text-sm text-text-secondary">
          <span>
            {path.completed_videos} / {path.total_videos} completed
          </span>
          <span>{Math.round(path.completion_pct)}%</span>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-xs text-text-muted">
          {path.last_activity_at
            ? `Last watched ${formatRelative(path.last_activity_at)}`
            : 'Not started yet'}
        </span>
        <Link
          to={`/learning-paths/${path.id}`}
          aria-label={`${started ? 'Continue' : 'Open path'} ${path.title}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
        >
          <Icon className="size-4" aria-hidden />
          {started ? 'Continue' : 'Open Path'}
        </Link>
      </div>
    </article>
  )
}
