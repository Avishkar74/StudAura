import { useCallback, useEffect, useRef, useState } from 'react'
import { putProgress } from '@/api/videos'
import { PlayerState, type YTPlayer } from '@/lib/youtube'

/** While playing, the position is saved this often (PRD 7.2: every 15-30 s). */
export const SAVE_INTERVAL_MS = 15_000
/** The backend is never called more than once per second (TRD 8.4). */
export const MIN_GAP_MS = 1_000
/** Ignore position changes smaller than this; they are not worth a request. */
const MIN_DELTA_SECONDS = 0.5

interface Options {
  /** Internal video id (the API path), not the YouTube id. */
  videoId: string
  /** The position already stored on the server. */
  savedPosition: number
  /** Called with each position the server has accepted. */
  onSaved?: (position: number) => void
}

/**
 * Saves the playback position to the backend.
 *
 * - Every 15 s while playing, and on pause, end and when leaving the page or video.
 * - At most one request per second: closer saves are coalesced into one trailing request.
 * - Nothing is ever saved until the student has actually played (or chosen Start over), so
 *   opening a video cued at 0:00 can never overwrite the position they left off at.
 * - A failed save keeps the position and is retried on the next tick; the UI is told.
 */
export function usePlaybackTracker({ videoId, savedPosition, onSaved }: Options) {
  const [saveFailed, setSaveFailed] = useState(false)

  const player = useRef<YTPlayer | null>(null)
  const hasPlayed = useRef(false)
  const lastSaved = useRef(savedPosition)
  const lastSentAt = useRef(0)
  const pending = useRef<number | null>(null)
  const trailing = useRef<number | undefined>(undefined)
  const ticker = useRef<number | undefined>(undefined)
  const onSavedRef = useRef(onSaved)

  useEffect(() => {
    onSavedRef.current = onSaved
  })

  const send = useCallback(
    async (position: number, keepalive: boolean) => {
      lastSentAt.current = Date.now()
      try {
        await putProgress(videoId, { last_position_seconds: position }, { keepalive })
        lastSaved.current = position
        setSaveFailed(false)
        onSavedRef.current?.(position)
      } catch {
        // Keep the position so the next tick or the page-leave flush tries again.
        if (pending.current === null) pending.current = position
        setSaveFailed(true)
      }
    },
    [videoId],
  )

  const flush = useCallback(
    (keepalive = false) => {
      window.clearTimeout(trailing.current)
      trailing.current = undefined
      const position = pending.current
      if (position === null) return
      pending.current = null
      void send(position, keepalive)
    },
    [send],
  )

  const queue = useCallback(
    (position: number, force = false) => {
      if (!hasPlayed.current && !force) return
      if (pending.current === null && Math.abs(position - lastSaved.current) < MIN_DELTA_SECONDS) {
        return
      }
      pending.current = position
      const wait = lastSentAt.current + MIN_GAP_MS - Date.now()
      if (wait <= 0) flush()
      else if (trailing.current === undefined) {
        trailing.current = window.setTimeout(() => flush(), wait)
      }
    },
    [flush],
  )

  const stopTicker = useCallback(() => {
    window.clearInterval(ticker.current)
    ticker.current = undefined
  }, [])

  const currentTime = (): number | null => {
    try {
      return player.current ? player.current.getCurrentTime() : null
    } catch {
      return null // the player was already destroyed
    }
  }

  const onReady = useCallback((p: YTPlayer) => {
    player.current = p
  }, [])

  const onStateChange = useCallback(
    (state: number, p: YTPlayer) => {
      player.current = p
      if (state === PlayerState.PLAYING) {
        hasPlayed.current = true
        if (ticker.current === undefined) {
          ticker.current = window.setInterval(() => {
            const t = currentTime()
            if (t !== null) queue(t)
            else flush()
            if (pending.current !== null) flush() // retry a failed save
          }, SAVE_INTERVAL_MS)
        }
      } else if (state === PlayerState.PAUSED || state === PlayerState.ENDED) {
        stopTicker()
        const t = currentTime()
        if (t !== null) queue(t)
      } else if (state !== PlayerState.BUFFERING) {
        stopTicker()
      }
    },

    [queue, flush, stopTicker],
  )

  /** Explicit "Start over": remember 0:00 even though nothing has played yet. */
  const startOver = useCallback(() => {
    queue(0, true)
  }, [queue])

  // Save on the way out: tab hidden or closed, and navigating away from the video.
  useEffect(() => {
    const leave = () => {
      // The page is going away, so this save skips the once-per-second throttle and uses
      // keepalive so the request can outlive the page.
      const t = currentTime()
      if (t !== null && hasPlayed.current && Math.abs(t - lastSaved.current) >= MIN_DELTA_SECONDS) {
        pending.current = t
      }
      flush(true)
    }
    const onVisibility = () => document.visibilityState === 'hidden' && leave()
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      stopTicker()
      leave()
    }
  }, [queue, flush, stopTicker])

  return { onReady, onStateChange, startOver, saveFailed }
}
