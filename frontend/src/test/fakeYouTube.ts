import { vi } from 'vitest'
import type { YTPlayer, YTPlayerOptions } from '@/lib/youtube'

/** Stand-in for a YouTube IFrame player: tests drive its events and read the calls made on it. */
export class FakePlayer implements YTPlayer {
  static instances: FakePlayer[] = []

  time = 0
  duration = 0
  state = -1
  destroyed = false
  seekTo = vi.fn((seconds: number) => {
    this.time = seconds
  })
  playVideo = vi.fn()
  pauseVideo = vi.fn()

  constructor(
    readonly element: HTMLElement,
    readonly options: YTPlayerOptions,
  ) {
    FakePlayer.instances.push(this)
  }

  getCurrentTime() {
    if (this.destroyed) throw new Error('player destroyed')
    return this.time
  }
  getDuration() {
    return this.duration
  }
  getPlayerState() {
    return this.state
  }
  destroy() {
    this.destroyed = true
  }

  ready() {
    this.options.events?.onReady?.({ target: this })
  }
  setState(state: number) {
    this.state = state
    this.options.events?.onStateChange?.({ data: state, target: this })
  }
  error(code: number) {
    this.options.events?.onError?.({ data: code, target: this })
  }

  static get last(): FakePlayer {
    const player = FakePlayer.instances[FakePlayer.instances.length - 1]
    if (!player) throw new Error('no player was created')
    return player
  }
}

export function installFakeYouTube() {
  FakePlayer.instances = []
  window.YT = {
    Player: FakePlayer as unknown as NonNullable<typeof window.YT>['Player'],
  }
}

export function uninstallFakeYouTube() {
  delete window.YT
  FakePlayer.instances = []
}
