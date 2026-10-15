import { useEffect, useRef } from 'react'
import { loadYouTubeApi, type YTPlayer } from '@/lib/youtube'

interface YouTubePlayerProps {
  youtubeVideoId: string
  onReady?: (player: YTPlayer) => void
  onStateChange?: (state: number, player: YTPlayer) => void
  /** The player reported an error (YouTube error code). */
  onError?: (code: number) => void
  /** The IFrame API could not be loaded at all (blocked, offline). */
  onLoadFailed?: () => void
}

/**
 * Embeds a video with the YouTube IFrame Player API. Embed only: no downloading, proxying or
 * hiding of YouTube's own controls. Uses the privacy-enhanced host.
 */
export function YouTubePlayer({
  youtubeVideoId,
  onReady,
  onStateChange,
  onError,
  onLoadFailed,
}: YouTubePlayerProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  // Handlers can change every render; the player must not be rebuilt for that.
  const handlers = useRef({ onReady, onStateChange, onError, onLoadFailed })
  useEffect(() => {
    handlers.current = { onReady, onStateChange, onError, onLoadFailed }
  })

  useEffect(() => {
    const parent = wrapper.current
    if (!parent) return
    let cancelled = false
    let player: YTPlayer | null = null
    // The API swaps the element it is given for an iframe, so give it one React does not own.
    const mount = document.createElement('div')
    parent.appendChild(mount)

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(mount, {
          videoId: youtubeVideoId,
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => handlers.current.onReady?.(e.target),
            onStateChange: (e) => handlers.current.onStateChange?.(e.data, e.target),
            onError: (e) => handlers.current.onError?.(e.data),
          },
        })
      })
      .catch(() => {
        if (!cancelled) handlers.current.onLoadFailed?.()
      })

    return () => {
      cancelled = true
      try {
        player?.destroy()
      } catch {
        /* already gone */
      }
      parent.replaceChildren()
    }
  }, [youtubeVideoId])

  return (
    <div
      ref={wrapper}
      className="aspect-video w-full overflow-hidden rounded-xl bg-surface-1 [&_iframe]:size-full"
    />
  )
}
