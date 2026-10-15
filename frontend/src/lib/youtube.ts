/** Minimal types and loader for the YouTube IFrame Player API (the only YouTube API the browser uses). */

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

/** Error codes that mean "this video cannot be played here". */
export const UNPLAYABLE_ERRORS = [100, 101, 150] as const

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getPlaybackRate?(): number
  destroy(): void
}

export interface YTPlayerOptions {
  videoId: string
  width?: string | number
  height?: string | number
  host?: string
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (e: { target: YTPlayer }) => void
    onStateChange?: (e: { data: number; target: YTPlayer }) => void
    onError?: (e: { data: number; target: YTPlayer }) => void
  }
}

export interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_SRC = 'https://www.youtube.com/iframe_api'
const LOAD_TIMEOUT_MS = 10_000

let loading: Promise<YTNamespace> | null = null

/** Loads the IFrame API once and resolves with `window.YT`. Rejects if it is blocked or slow. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loading) return loading

  loading = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      loading = null
      reject(new Error('YouTube player API timed out'))
    }, LOAD_TIMEOUT_MS)

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      window.clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else {
        loading = null
        reject(new Error('YouTube player API unavailable'))
      }
    }

    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const script = document.createElement('script')
      script.src = API_SRC
      script.async = true
      script.onerror = () => {
        window.clearTimeout(timer)
        loading = null
        reject(new Error('YouTube player API failed to load'))
      }
      document.head.appendChild(script)
    }
  })
  return loading
}
