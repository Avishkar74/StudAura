import { useCallback, useEffect, useRef } from 'react'
import { postViewingSession } from '@/api/goals'
import { PlayerState } from '@/lib/youtube'

/** While playing, the running total is sent this often. */
export const PING_INTERVAL_MS = 15_000
/** How often playing time is added up. */
const TICK_MS = 1_000
/** Never more than one request a second (TRD 8.4). */
const MIN_GAP_MS = 1_000
/** One tick adds at most this much, so a sleeping laptop or a frozen tab can't claim hours. */
const MAX_TICK_SECONDS = 65

/**
 * Adds up the time the video is actually playing, for the daily goal (PRD 7.5).
 *
 * - Only PLAYING counts. Paused, buffering (which includes seeking) and ended add nothing, and
 *   neither does having the page open.
 * - One viewing is one session from the first play until the student leaves the video. The total
 *   is cumulative, so a lost, repeated or late request can never double count: the next ping
 *   simply carries everything, and the server keeps the largest total it has seen.
 * - Sent every 15 s while playing, on pause or end, and on the way out (keepalive).
 * - `onRecorded` runs after the server has the time, e.g. to refresh today's total.
 * - A failed ping is not queued; the next one covers it. The student is not interrupted.
 */
export function useViewingTime(videoId: string, onRecorded?: () => void) {
  const startedAt = useRef<string | null>(null)
  const total = useRef(0)
  const countingFrom = useRef<number | null>(null)
  const reported = useRef(0)
  const lastSentAt = useRef(0)
  const tick = useRef<number | undefined>(undefined)
  const ping = useRef<number | undefined>(undefined)
  const trailing = useRef<number | undefined>(undefined)
  const recorded = useRef(onRecorded)
  useEffect(() => {
    recorded.current = onRecorded
  })

  const accrue = useCallback(() => {
    if (countingFrom.current === null) return
    const now = Date.now()
    total.current += Math.min((now - countingFrom.current) / 1000, MAX_TICK_SECONDS)
    countingFrom.current = now
  }, [])

  const send = useCallback(
    (keepalive: boolean) => {
      window.clearTimeout(trailing.current)
      trailing.current = undefined
      const seconds = Math.floor(total.current)
      if (startedAt.current === null || seconds <= reported.current) return
      lastSentAt.current = Date.now()
      postViewingSession(
        { video_id: videoId, started_at: startedAt.current, watched_seconds: seconds },
        { keepalive },
      )
        .then(() => {
          reported.current = Math.max(reported.current, seconds)
          recorded.current?.()
        })
        .catch(() => {
          /* the next ping carries this time too */
        })
    },
    [videoId],
  )

  const report = useCallback(
    (keepalive = false) => {
      const wait = lastSentAt.current + MIN_GAP_MS - Date.now()
      if (keepalive || wait <= 0) send(keepalive)
      else if (trailing.current === undefined) {
        trailing.current = window.setTimeout(() => send(false), wait)
      }
    },
    [send],
  )

  const stopTimers = useCallback(() => {
    window.clearInterval(tick.current)
    window.clearInterval(ping.current)
    tick.current = undefined
    ping.current = undefined
  }, [])

  const onStateChange = useCallback(
    (state: number) => {
      if (state === PlayerState.PLAYING) {
        if (startedAt.current === null) startedAt.current = new Date().toISOString()
        if (countingFrom.current === null) countingFrom.current = Date.now()
        if (tick.current === undefined) tick.current = window.setInterval(accrue, TICK_MS)
        if (ping.current === undefined) {
          ping.current = window.setInterval(() => {
            accrue()
            report()
          }, PING_INTERVAL_MS)
        }
        return
      }
      // Anything else (paused, buffering, seeking, ended, cued) stops the clock.
      accrue()
      countingFrom.current = null
      stopTimers()
      report()
    },
    [accrue, report, stopTimers],
  )

  // The tab being hidden or closed, and leaving the video: add up what has played and send it.
  useEffect(() => {
    const leave = () => {
      accrue()
      report(true)
    }
    const onVisibility = () => document.visibilityState === 'hidden' && leave()
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      stopTimers()
      leave()
    }
  }, [accrue, report, stopTimers])

  return { onStateChange }
}
