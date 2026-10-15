import { useCallback, useEffect, useRef, useState } from 'react'
import { putProgress } from '@/api/videos'
import type { ProgressFields } from '@/api/types'
import { PlayerState, type YTPlayer } from '@/lib/youtube'
import { SeekDetector } from './seekDetector'

/** While playing, the position is saved this often (PRD 7.2: every 15-30 s). */
export const SAVE_INTERVAL_MS = 15_000
/** The backend is never called more than once per second (TRD 8.4). */
export const MIN_GAP_MS = 1_000
/** Ignore position changes smaller than this; they are not worth a request. */
const MIN_DELTA_SECONDS = 0.5
/** How often playback is checked for seeks while playing. */
const SEEK_CHECK_MS = 1_000
/** A failed "video ended" report is retried after this long (the 15 s ticker has stopped). */
const END_RETRY_MS = 5_000

interface Options {
  /** Internal video id (the API path), not the YouTube id. */
  videoId: string
  /** The position already stored on the server. */
  savedPosition: number
  /** Called with each position the server has accepted. */
  onSaved?: (position: number) => void
  /** Called with the server's view of the video after each save (status may have changed). */
  onProgress?: (progress: Partial<ProgressFields>) => void
}

function rateOf(player: YTPlayer | null): number {
  try {
    return player?.getPlaybackRate?.() ?? 1
  } catch {
    return 1
  }
}

/**
 * Saves the playback position to the backend.
 *
 * - Every 15 s while playing, and on pause, end and when leaving the page or video.
 * - At most one request per second: closer saves are coalesced into one trailing request.
 * - Nothing is ever saved until the student has actually played (or chosen Start over), so
 *   opening a video cued at 0:00 can never overwrite the position they left off at.
 * - A failed save keeps the position and is retried on the next tick; the UI is told.
 * - Watches for seeks. When the video ends, the final save says whether the student seeked, and
 *   the server alone decides whether that completes the video (a seek never does).
 */
export function usePlaybackTracker({ videoId, savedPosition, onSaved, onProgress }: Options) {
  const [saveFailed, setSaveFailed] = useState(false)

  const player = useRef<YTPlayer | null>(null)
  const hasPlayed = useRef(false)
  const lastSaved = useRef(savedPosition)
  const lastSentAt = useRef(0)
  const pending = useRef<number | null>(null)
  const trailing = useRef<number | undefined>(undefined)
  const ticker = useRef<number | undefined>(undefined)
  const seekTimer = useRef<number | undefined>(undefined)
  const detector = useRef(new SeekDetector())
  // An ENDED report waiting to go out with the next save; kept until a save succeeds.
  const endReport = useRef<{ seeked: boolean } | null>(null)
  const onSavedRef = useRef(onSaved)
  const onProgressRef = useRef(onProgress)

  useEffect(() => {
    onSavedRef.current = onSaved
    onProgressRef.current = onProgress
  })

  const flushRef = useRef<() => void>(() => {})

  const send = useCallback(
    async (position: number, keepalive: boolean) => {
      lastSentAt.current = Date.now()
      const ended = endReport.current
      endReport.current = null
      try {
        const saved = await putProgress(
          videoId,
          ended
            ? {
                last_position_seconds: position,
                playback_ended: true,
                session_seeked: ended.seeked,
              }
            : { last_position_seconds: position },
          { keepalive },
        )
        lastSaved.current = position
        setSaveFailed(false)
        onSavedRef.current?.(position)
        if (saved?.learning_status) onProgressRef.current?.(saved)
      } catch {
        // Keep the position (and any ENDED report) so the next tick or the page-leave flush
        // tries again.
        if (ended && endReport.current === null) {
          endReport.current = ended
          if (trailing.current === undefined) {
            trailing.current = window.setTimeout(() => flushRef.current(), END_RETRY_MS)
          }
        }
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

  useEffect(() => {
    flushRef.current = flush
  })

  const queue = useCallback(
    (position: number, force = false) => {
      if (!hasPlayed.current && !force) return
      if (
        !force &&
        pending.current === null &&
        Math.abs(position - lastSaved.current) < MIN_DELTA_SECONDS
      ) {
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

  const stopSeekTimer = useCallback(() => {
    window.clearInterval(seekTimer.current)
    seekTimer.current = undefined
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
      const t = currentTime()
      if (state === PlayerState.PLAYING) {
        hasPlayed.current = true
        if (t !== null) detector.current.play(t, Date.now())
        if (seekTimer.current === undefined) {
          seekTimer.current = window.setInterval(() => {
            const now = currentTime()
            if (now !== null) detector.current.observe(now, Date.now(), rateOf(player.current))
          }, SEEK_CHECK_MS)
        }
        if (ticker.current === undefined) {
          ticker.current = window.setInterval(() => {
            const t = currentTime()
            if (t !== null) queue(t)
            else flush()
            if (pending.current !== null) flush() // retry a failed save
          }, SAVE_INTERVAL_MS)
        }
      } else if (state === PlayerState.ENDED) {
        stopTicker()
        stopSeekTimer()
        if (t !== null) {
          // The last reading catches a jump straight to the end that no timer tick saw.
          detector.current.observe(t, Date.now(), rateOf(player.current))
          endReport.current = { seeked: detector.current.seeked }
          queue(t, true)
        }
        detector.current.reset(0) // a replay starts again from 0:00 as a new viewing session
      } else {
        // Paused, buffering, cued: the position should hold still until playback resumes.
        stopSeekTimer()
        if (t !== null) detector.current.park(t)
        if (state === PlayerState.PAUSED) {
          stopTicker()
          if (t !== null) queue(t)
        } else if (state !== PlayerState.BUFFERING) {
          stopTicker()
        }
      }
    },

    [queue, flush, stopTicker, stopSeekTimer],
  )

  /** Explicit "Start over": remember 0:00 even though nothing has played yet. */
  const startOver = useCallback(() => {
    detector.current.moveTo(0)
    queue(0, true)
  }, [queue])

  /** Resume jumped the playhead on purpose; that is not a seek past unwatched content. */
  const movedTo = useCallback((position: number) => {
    detector.current.moveTo(position)
  }, [])

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
      stopSeekTimer()
      leave()
    }
  }, [queue, flush, stopTicker, stopSeekTimer])

  return { onReady, onStateChange, startOver, movedTo, saveFailed }
}
