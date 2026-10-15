import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  ExternalLink,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LearningStatus, PathVideo, VideoDetail } from '@/api/types'
import { putProgress } from '@/api/videos'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { StatusBadge } from '@/components/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatRelative, formatTimestamp } from '@/lib/time'
import { PlayerState, type YTPlayer } from '@/lib/youtube'
import { pathKeys } from '@/features/learning-paths/queries'
import { shouldOfferResume } from './resume'
import { usePlaybackTracker } from './usePlaybackTracker'
import { WorkspacePanel } from './WorkspacePanel'
import { YouTubePlayer } from './YouTubePlayer'

export interface WorkspaceProps {
  item: PathVideo | (VideoDetail & { position?: number })
  /** Where the back link goes, e.g. the path this video belongs to. */
  back: { to: string; label: string }
  previous?: { to: string; title: string }
  next?: { to: string; title: string }
}

type Failure = 'unplayable' | 'player-unavailable' | null

function watchUrl(youtubeVideoId: string) {
  return `https://www.youtube.com/watch?v=${youtubeVideoId}`
}

function Fallback({
  youtubeVideoId,
  reason,
}: {
  youtubeVideoId: string
  reason: Exclude<Failure, null>
}) {
  return (
    <div
      role="alert"
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface-1 p-6 text-center"
    >
      <TriangleAlert className="size-8 text-warning" aria-hidden />
      <p className="max-w-md font-semibold">
        {reason === 'unplayable'
          ? "This video can't be played here."
          : "The video player couldn't be loaded."}
      </p>
      <p className="max-w-md text-sm text-text-secondary">
        {reason === 'unplayable'
          ? 'It may be private, removed, or restricted by its owner. Your notes and progress are kept.'
          : 'Check your connection or any content blocker, then reload. Your notes and progress are kept.'}
      </p>
      <a
        href={watchUrl(youtubeVideoId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
      >
        Watch on YouTube
        <ExternalLink className="size-4" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  )
}

/** The video workspace: player, resume prompt and playback progress. */
export function Workspace({ item, back, previous, next }: WorkspaceProps) {
  const { video } = item
  useDocumentTitle(video.title)

  const qc = useQueryClient()
  const [savedPosition, setSavedPosition] = useState(item.last_position_seconds)
  const [offerResume, setOfferResume] = useState(() =>
    shouldOfferResume(item.last_position_seconds, video.duration_seconds),
  )
  const [failure, setFailure] = useState<Failure>(
    video.availability_state === 'embed_disabled' ? 'unplayable' : null,
  )
  const [player, setPlayer] = useState<YTPlayer | null>(null)
  // Playback can change the status (a clean ending completes the video), so follow the server.
  const [status, setStatus] = useState<LearningStatus>(item.learning_status)

  const tracker = usePlaybackTracker({
    videoId: video.id,
    savedPosition: item.last_position_seconds,
    onSaved: setSavedPosition,
    onProgress: (p) => p.learning_status && setStatus(p.learning_status),
  })

  const setLearningStatus = useMutation({
    mutationFn: (learning_status: LearningStatus) => putProgress(video.id, { learning_status }),
    onSuccess: (saved) => setStatus(saved.learning_status),
  })

  // Path pages and the dashboard read progress from the cache; refresh them on the way out.
  useEffect(() => {
    return () => {
      void qc.invalidateQueries({ queryKey: pathKeys.all })
    }
  }, [qc])

  const pct =
    video.duration_seconds && video.duration_seconds > 0
      ? Math.min(100, (savedPosition / video.duration_seconds) * 100)
      : null

  function resume() {
    tracker.movedTo(savedPosition)
    player?.seekTo(savedPosition, true)
    player?.playVideo()
    setOfferResume(false)
  }

  function startOver() {
    player?.seekTo(0, true)
    player?.playVideo()
    tracker.startOver()
    setSavedPosition(0)
    setOfferResume(false)
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>

        {failure ? (
          <Fallback youtubeVideoId={video.youtube_video_id} reason={failure} />
        ) : (
          <YouTubePlayer
            key={video.id}
            youtubeVideoId={video.youtube_video_id}
            onReady={(p) => {
              setPlayer(p)
              tracker.onReady(p)
            }}
            onStateChange={(state, p) => {
              if (state === PlayerState.PLAYING) setOfferResume(false)
              tracker.onStateChange(state, p)
            }}
            // Every player error (private, removed, embedding blocked, bad id) means it cannot play here.
            onError={() => setFailure('unplayable')}
            onLoadFailed={() => setFailure('player-unavailable')}
          />
        )}

        {offerResume && !failure && (
          <div
            role="region"
            aria-label="Resume playback"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-1 p-3"
          >
            <p className="text-sm">
              Resume from <strong>{formatTimestamp(savedPosition)}</strong>?
            </p>
            <div className="flex gap-2">
              <Button onClick={resume} disabled={!player}>
                Resume
              </Button>
              <Button variant="secondary" onClick={startOver} disabled={!player}>
                Start over
              </Button>
            </div>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{video.title}</h1>
          {video.channel_title && <p className="text-text-secondary">{video.channel_title}</p>}
        </div>

        <section
          aria-label="Playback progress"
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Playback progress</h2>
            <StatusBadge status={status} />
          </div>
          {pct !== null ? (
            <div>
              <ProgressBar value={pct} label="Playback progress" />
              <p className="mt-1.5 text-sm text-text-secondary">
                {Math.round(pct)}% · {formatTimestamp(savedPosition)} of{' '}
                {formatTimestamp(video.duration_seconds ?? 0)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              {savedPosition > 0
                ? `Saved position ${formatTimestamp(savedPosition)}`
                : 'Not started yet'}
            </p>
          )}
          {item.last_watched_at && (
            <p className="text-xs text-text-muted">
              Last watched {formatRelative(item.last_watched_at)}
            </p>
          )}
          <div role="group" aria-label="Learning status" className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setLearningStatus.mutate('COMPLETED')}
              disabled={status === 'COMPLETED' || setLearningStatus.isPending}
              aria-pressed={status === 'COMPLETED'}
            >
              <CircleCheck className="mr-2 size-4" aria-hidden />
              {status === 'COMPLETED' ? 'Completed' : 'Mark completed'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLearningStatus.mutate('NEEDS_REVISION')}
              disabled={status === 'NEEDS_REVISION' || setLearningStatus.isPending}
              aria-pressed={status === 'NEEDS_REVISION'}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden />
              Needs revision
            </Button>
          </div>
          {setLearningStatus.isError && (
            <p role="alert" className="text-sm text-warning">
              Couldn&apos;t update the status. Try again.
            </p>
          )}
          {tracker.saveFailed && (
            <p role="status" className="text-sm text-warning">
              Couldn&apos;t save your place. Retrying…
            </p>
          )}
        </section>

        {(previous || next) && (
          <nav aria-label="Videos in this path" className="flex flex-wrap justify-between gap-3">
            {previous ? (
              <Link
                to={previous.to}
                aria-label={`Previous: ${previous.title}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
              >
                <ArrowLeft className="size-4" aria-hidden />
                <span>
                  <span className="text-text-muted">Previous: </span>
                  {previous.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                to={next.to}
                aria-label={`Next: ${next.title}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
              >
                <span>
                  <span className="text-text-muted">Next: </span>
                  {next.title}
                </span>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </div>
      <WorkspacePanel
        videoId={video.id}
        getCurrentTime={() => {
          try {
            return player ? player.getCurrentTime() : null
          } catch {
            return null // the player was already destroyed
          }
        }}
        onSeek={player ? (seconds) => player.seekTo(seconds, true) : undefined}
      />
    </div>
  )
}
