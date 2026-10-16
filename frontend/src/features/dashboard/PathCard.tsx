import { FolderOpen, GraduationCap, Pencil, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LearningPath } from '@/api/types'
import { ProgressBar } from '@/components/ProgressBar'
import { formatDate, formatRelative } from '@/lib/time'

interface PathCardProps {
  path: LearningPath
  /** When given, the card shows edit and delete buttons. */
  onEdit?: (path: LearningPath) => void
  onDelete?: (path: LearningPath) => void
}

export function PathCard({ path, onEdit, onDelete }: PathCardProps) {
  const started = path.completed_videos > 0 || path.in_progress_videos > 0 || path.last_activity_at
  const Icon = started ? Play : FolderOpen

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
          <GraduationCap className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-semibold">{path.title}</h3>
          <p className="text-sm text-text-secondary">
            {path.total_videos} {path.total_videos === 1 ? 'video' : 'videos'}
            {path.target_date && <span> · Target {formatDate(path.target_date)}</span>}
          </p>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex shrink-0 gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(path)}
                aria-label={`Edit ${path.title}`}
                className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(path)}
                aria-label={`Delete ${path.title}`}
                className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
      {path.description && (
        <p className="line-clamp-2 text-sm text-text-secondary">{path.description}</p>
      )}

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
