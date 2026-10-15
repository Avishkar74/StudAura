import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { putProgress } from '@/api/videos'
import { PlayerState, type YTPlayer } from '@/lib/youtube'
import { FakePlayer } from '@/test/fakeYouTube'
import { MIN_GAP_MS, SAVE_INTERVAL_MS, usePlaybackTracker } from './usePlaybackTracker'

vi.mock('@/api/videos', () => ({ putProgress: vi.fn() }))
const put = vi.mocked(putProgress)

function setup(savedPosition = 0) {
  const onSaved = vi.fn()
  const hook = renderHook(() => usePlaybackTracker({ videoId: 'vid-1', savedPosition, onSaved }))
  const player = new FakePlayer(document.createElement('div'), {
    videoId: 'x',
  })
  act(() => hook.result.current.onReady(player as YTPlayer))
  const emit = (state: number, time?: number) => {
    if (time !== undefined) player.time = time
    act(() => hook.result.current.onStateChange(state, player as YTPlayer))
  }
  return { ...hook, player, emit, onSaved }
}

const lastBody = () => put.mock.calls.at(-1)?.[1]
const flushPromises = () => act(async () => void (await Promise.resolve()))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  put.mockReset()
  put.mockResolvedValue({} as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what triggers a save', () => {
  it('saves nothing before the student has played', async () => {
    const { emit, unmount } = setup(500)
    emit(PlayerState.PAUSED, 0)
    emit(PlayerState.CUED, 0)
    unmount()
    expect(put).not.toHaveBeenCalled()
  })

  it('never overwrites the saved position with 0:00 when leaving without playing', async () => {
    const { unmount, player } = setup(500)
    player.time = 0 // the video is cued at the start behind a "Resume?" prompt
    window.dispatchEvent(new Event('pagehide'))
    unmount()
    expect(put).not.toHaveBeenCalled()
  })

  it('saves every 15 seconds while playing', async () => {
    const { emit, player } = setup()
    emit(PlayerState.PLAYING, 10)
    expect(put).not.toHaveBeenCalled() // the first save is one interval after play starts

    player.time = 25
    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenLastCalledWith(
      'vid-1',
      { last_position_seconds: 25 },
      { keepalive: false },
    )

    player.time = 40
    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(put).toHaveBeenCalledTimes(2)
    expect(lastBody()).toEqual({ last_position_seconds: 40 })
  })

  it('saves immediately on pause and stops the 15 second timer', async () => {
    const { emit } = setup()
    emit(PlayerState.PLAYING, 5)
    emit(PlayerState.PAUSED, 77)
    expect(put).toHaveBeenCalledTimes(1)
    expect(lastBody()).toEqual({ last_position_seconds: 77 })

    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS * 3))
    expect(put).toHaveBeenCalledTimes(1) // paused: nothing more to send
  })

  it('saves at the end of the video', async () => {
    const { emit } = setup()
    emit(PlayerState.PLAYING, 1)
    emit(PlayerState.ENDED, 600)
    expect(lastBody()).toEqual({ last_position_seconds: 600 })
  })

  it('keeps the timer running through buffering', async () => {
    const { emit, player } = setup()
    emit(PlayerState.PLAYING, 1)
    emit(PlayerState.BUFFERING, 2)
    player.time = 30
    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('"Start over" remembers 0:00 even though nothing has played', async () => {
    const { result } = setup(500)
    act(() => result.current.startOver())
    expect(lastBody()).toEqual({ last_position_seconds: 0 })
  })

  it('saves when the tab is hidden or closed, using keepalive', async () => {
    const { emit } = setup()
    emit(PlayerState.PLAYING, 123)
    window.dispatchEvent(new Event('pagehide'))
    expect(put).toHaveBeenCalledWith('vid-1', { last_position_seconds: 123 }, { keepalive: true })
  })

  it('saves when navigating away (unmount)', async () => {
    const { emit, unmount } = setup()
    emit(PlayerState.PLAYING, 321)
    unmount()
    expect(put).toHaveBeenCalledWith('vid-1', { last_position_seconds: 321 }, { keepalive: true })
  })

  it('does not throw if the player was destroyed before unmount', async () => {
    const { emit, player, unmount } = setup()
    emit(PlayerState.PLAYING, 50)
    player.destroy()
    expect(() => unmount()).not.toThrow()
  })
})

describe('request rate', () => {
  it('never sends more than one request per second; closer saves are coalesced', async () => {
    const { emit } = setup()
    emit(PlayerState.PLAYING, 1)
    emit(PlayerState.PAUSED, 10) // goes out now
    emit(PlayerState.PLAYING, 10)
    emit(PlayerState.PAUSED, 20) // too soon: held back
    emit(PlayerState.PLAYING, 20)
    emit(PlayerState.PAUSED, 30) // replaces the held-back position
    expect(put).toHaveBeenCalledTimes(1)

    await act(async () => void vi.advanceTimersByTime(MIN_GAP_MS))
    expect(put).toHaveBeenCalledTimes(2)
    expect(lastBody()).toEqual({ last_position_seconds: 30 }) // only the latest is sent
  })

  it('skips a save when the position has barely moved', async () => {
    const { emit } = setup()
    emit(PlayerState.PLAYING, 100)
    emit(PlayerState.PAUSED, 100)
    await flushPromises()
    vi.advanceTimersByTime(MIN_GAP_MS * 2)
    emit(PlayerState.PLAYING, 100.2)
    emit(PlayerState.PAUSED, 100.3)
    expect(put).toHaveBeenCalledTimes(1)
  })
})

describe('failures', () => {
  it('reports a failed save and retries on the next tick', async () => {
    const { emit, result, player, onSaved } = setup()
    put.mockRejectedValueOnce(new Error('offline'))
    emit(PlayerState.PLAYING, 1)
    player.time = 60
    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(result.current.saveFailed).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()

    player.time = 75
    await act(async () => void vi.advanceTimersByTime(SAVE_INTERVAL_MS))
    expect(result.current.saveFailed).toBe(false)
    expect(onSaved).toHaveBeenCalledTimes(1)
    // The newest position wins; nothing is lost because the next tick sends where they are now.
    expect(lastBody()).toEqual({ last_position_seconds: 75 })
  })

  it('tells the caller about each accepted position', async () => {
    const { emit, onSaved } = setup()
    emit(PlayerState.PLAYING, 1)
    emit(PlayerState.PAUSED, 42)
    await flushPromises()
    expect(onSaved).toHaveBeenCalledWith(42)
  })
})
