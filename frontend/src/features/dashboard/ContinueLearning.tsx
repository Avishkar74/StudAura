import { Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { LearningItem } from '@/api/types'
import { ProgressBar } from '@/components/ProgressBar'
import { formatRelative, formatTimestamp } from '@/lib/time'

/** Where a watched video opens: inside its path when it has one, else as a saved video. */
export function learnUrl(item: Pick<LearningItem, 'video_id' | 'path'>): string {
  return item.path ? `/learn/${item.path.id}/${item.video_id}` : `/learn/saved/${item.video_id}`
}

export function Thumbnail({ src, className = '' }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-surface-2 ${className}`}>
      <Play className="size-6 text-text-muted" aria-hidden />
    </span>
  )
}

/** The one video to pick up next (PRD 6.2). */
export function ContinueLearning({ item }: { item: LearningItem }) {
  const { video, path, playback_pct: pct } = item
  const title = video.title
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-surface-1 p-4 sm:flex-row">
      <Thumbnail
        src={video.thumbnail_url}
        className="aspect-video w-full shrink-0 overflow-hidden rounded-lg sm:w-64"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-lg font-semibold">{title}</h3>
          <p className="truncate text-sm text-text-secondary">
            {path ? path.title : 'Saved video'}
            {video.channel_title ? ` · ${video.channel_title}` : ''}
          </p>
        </div>
        <div>
          {pct !== null && <ProgressBar value={pct} label={`${title} progress`} />}
          <p className="mt-1.5 text-sm text-text-secondary">
            {pct !== null && video.duration_seconds
              ? `${Math.round(pct)}% · ${formatTimestamp(item.last_position_seconds)} of ${formatTimestamp(video.duration_seconds)}`
              : `Left off at ${formatTimestamp(item.last_position_seconds)}`}
            <span className="text-text-muted">
              {' '}
              · Last watched {formatRelative(item.last_watched_at)}
            </span>
          </p>
        </div>
        <Link
          to={learnUrl(item)}
          aria-label={`Resume ${title}`}
          className="mt-auto inline-flex w-fit items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-accent-hover"
        >
          <Play className="size-4" aria-hidden />
          Resume
        </Link>
      </div>
    </article>
  )
}
