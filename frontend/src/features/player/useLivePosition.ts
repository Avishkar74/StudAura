import { useEffect, useState } from 'react'
import type { YTPlayer } from '@/lib/youtube'

/**
 * The player's current time in seconds, kept fresh for display.
 *
 * It ticks every second while the video plays, and reads again on every player state change
 * (`stateChanges` counts them), which also covers seeking while paused. Before the player exists,
 * or after it is destroyed, it stays at `fallback`, the last position the server saved.
 */
export function useLivePosition(
  player: YTPlayer | null,
  playing: boolean,
  fallback: number,
  stateChanges = 0,
) {
  const [position, setPosition] = useState(fallback)

  useEffect(() => {
    if (!player) return
    const read = () => {
      try {
        const now = player.getCurrentTime()
        if (Number.isFinite(now)) setPosition(now)
      } catch {
        /* the player was already destroyed */
      }
    }
    read()
    if (!playing) return
    const timer = window.setInterval(read, 1000)
    return () => window.clearInterval(timer)
  }, [player, playing, stateChanges])

  return position
}
