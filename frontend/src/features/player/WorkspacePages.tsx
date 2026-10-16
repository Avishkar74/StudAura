import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { usePath, useWorkspacePathVideos, useWorkspaceVideo } from './queries'
import { Workspace } from './Workspace'

function Problem({
  title,
  message,
  link,
  onRetry,
}: {
  title: string
  message: string
  link?: { to: string; label: string }
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-3 p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-text-secondary">{message}</p>
      <div className="flex gap-3">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {link && (
          <Link to={link.to} className="self-center text-sm font-medium underline">
            {link.label}
          </Link>
        )}
      </div>
    </div>
  )
}

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404

/** /learn/:pathId/:videoId - a video opened from one of the user's learning paths. */
export function PathWorkspacePage() {
  const { pathId = '', videoId = '' } = useParams()
  const videos = useWorkspacePathVideos(pathId)
  const path = usePath(pathId)

  if (videos.isPending) return <FullPageSpinner />
  if (videos.isError) {
    return isNotFound(videos.error) ? (
      <Problem
        title="Learning path not found"
        message="It may have been deleted."
        link={{ to: '/learning-paths', label: 'All learning paths' }}
      />
    ) : (
      <Problem
        title="Couldn't load this video"
        message="Check your connection and try again."
        onRetry={() => void videos.refetch()}
      />
    )
  }

  const items = videos.data.items
  const index = items.findIndex((i) => i.video.id === videoId)
  if (index === -1) {
    return (
      <Problem
        title="This video isn't in the learning path"
        message="It may have been removed from it."
        link={{
          to: `/learning-paths/${pathId}`,
          label: 'Back to the learning path',
        }}
      />
    )
  }

  const toVideo = (i: number) => ({
    to: `/learn/${pathId}/${items[i].video.id}`,
    title: items[i].video.title,
  })

  return (
    <Workspace
      key={videoId}
      pathId={pathId}
      item={items[index]}
      back={{
        to: `/learning-paths/${pathId}`,
        label: path.data?.title ?? 'Back to learning path',
      }}
      previous={index > 0 ? toVideo(index - 1) : undefined}
      next={index < items.length - 1 ? toVideo(index + 1) : undefined}
    />
  )
}

/** /learn/saved/:videoId - a standalone video, outside any path. */
export function SavedWorkspacePage() {
  const { videoId = '' } = useParams()
  const video = useWorkspaceVideo(videoId)

  if (video.isPending) return <FullPageSpinner />
  if (video.isError) {
    return isNotFound(video.error) ? (
      <Problem
        title="Video not found"
        message="It may have been removed, or it isn't in your library."
        link={{ to: '/library', label: 'Saved videos' }}
      />
    ) : (
      <Problem
        title="Couldn't load this video"
        message="Check your connection and try again."
        onRetry={() => void video.refetch()}
      />
    )
  }

  return (
    <Workspace key={videoId} item={video.data} back={{ to: '/library', label: 'Saved videos' }} />
  )
}
