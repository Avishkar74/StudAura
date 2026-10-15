import { ArrowLeft, Play } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { PathVideo } from '@/api/types'
import { useShell } from '@/app/shell/shellContext'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { StatusBadge } from '@/components/StatusBadge'
import { usePath, usePathVideos } from '@/features/player/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatTimestamp } from '@/lib/time'
import { pickContinueTarget } from './continue'

function VideoRow({ pathId, item }: { pathId: string; item: PathVideo }) {
  const { video } = item
  const unavailable = video.availability_state === 'embed_disabled'
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface-1 p-3">
      <span className="w-6 shrink-0 text-center text-sm text-text-muted">{item.position}</span>
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-36">
        {video.thumbnail_url && (
          <img src={video.thumbnail_url} alt="" loading="lazy" className="size-full object-cover" />
        )}
        {video.duration_seconds && (
          <span className="absolute right-1 bottom-1 rounded bg-bg/80 px-1.5 py-0.5 text-xs">
            {formatTimestamp(video.duration_seconds)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          to={`/learn/${pathId}/${video.id}`}
          className="line-clamp-2 font-medium hover:underline"
        >
          {video.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <StatusBadge status={item.learning_status} />
          {item.playback_pct !== null && item.playback_pct > 0 && (
            <span>{Math.round(item.playback_pct)}% watched</span>
          )}
          {unavailable && <span className="text-warning">Can&apos;t be embedded</span>}
        </div>
        {item.playback_pct !== null && item.playback_pct > 0 && (
          <ProgressBar
            className="mt-2 max-w-xs"
            value={item.playback_pct}
            label={`${video.title} playback`}
          />
        )}
      </div>
      <Link
        to={`/learn/${pathId}/${video.id}`}
        aria-label={`Open ${video.title}`}
        className="hidden shrink-0 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3 sm:inline-flex"
      >
        Open
      </Link>
    </li>
  )
}

export function PathPage() {
  const { pathId = '' } = useParams()
  const path = usePath(pathId)
  const videos = usePathVideos(pathId)
  const { openAddVideo, openImportPlaylist } = useShell()
  useDocumentTitle(path.data?.title ?? 'Learning path')

  if (path.isError) {
    const missing = path.error instanceof ApiError && path.error.status === 404
    return (
      <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-3 p-6">
        <h1 className="text-2xl font-semibold">
          {missing ? 'Learning path not found' : "Couldn't load this learning path"}
        </h1>
        <p className="text-text-secondary">
          {missing ? 'It may have been deleted.' : 'Check your connection and try again.'}
        </p>
        {!missing && (
          <Button variant="secondary" onClick={() => void path.refetch()}>
            Try again
          </Button>
        )}
        <Link to="/learning-paths" className="text-sm font-medium underline">
          All learning paths
        </Link>
      </div>
    )
  }

  if (path.isPending) {
    return (
      <div role="status" aria-label="Loading learning path" className="p-6">
        <div className="h-32 animate-pulse rounded-xl border border-border bg-surface-1" />
      </div>
    )
  }

  const p = path.data
  const items = videos.data?.items ?? []
  const target = pickContinueTarget(items)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <Link
        to="/learning-paths"
        className="inline-flex w-fit items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All Learning Paths
      </Link>

      <header className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{p.title}</h1>
          {p.description && <p className="mt-1 text-text-secondary">{p.description}</p>}
        </div>
        <div>
          <ProgressBar value={p.completion_pct} label={`${p.title} progress`} />
          <p className="mt-1.5 text-sm text-text-secondary">
            {p.completed_videos} of {p.total_videos} completed · {Math.round(p.completion_pct)}%
            {p.target_date && ` · Target: ${new Date(p.target_date).toLocaleDateString()}`}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          <div className="flex gap-1.5">
            <dt>Videos</dt>
            <dd className="font-medium text-text-primary">{p.total_videos}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>In progress</dt>
            <dd className="font-medium text-text-primary">{p.in_progress_videos}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Needs revision</dt>
            <dd className="font-medium text-text-primary">{p.needs_revision_videos}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {target && (
            <Link
              to={`/learn/${pathId}/${target.video.video.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-accent-hover"
            >
              <Play className="size-4" aria-hidden />
              {target.label}
            </Link>
          )}
          <Button variant="secondary" onClick={() => openAddVideo(pathId)}>
            Add video
          </Button>
          <Button variant="secondary" onClick={() => openImportPlaylist(pathId)}>
            Import playlist
          </Button>
        </div>
      </header>

      {videos.isPending && (
        <p role="status" className="text-sm text-text-secondary">
          Loading videos…
        </p>
      )}
      {videos.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="font-semibold">Couldn&apos;t load the videos.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void videos.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {videos.isSuccess && items.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
          <h2 className="text-xl font-semibold">No videos yet.</h2>
          <p className="max-w-md text-text-secondary">
            Add a YouTube video or import a whole playlist to start this path.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => openAddVideo(pathId)}>Add a video</Button>
            <Button variant="secondary" onClick={() => openImportPlaylist(pathId)}>
              Import a playlist
            </Button>
          </div>
        </section>
      )}
      {items.length > 0 && (
        <ol aria-label="Videos" className="flex flex-col gap-2">
          {items.map((item) => (
            <VideoRow key={item.video.id} pathId={pathId} item={item} />
          ))}
        </ol>
      )}
    </div>
  )
}
