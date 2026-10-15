import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { postViewingSession } from '@/api/goals'
import { PlayerState } from '@/lib/youtube'
import { PING_INTERVAL_MS, useViewingTime } from './useViewingTime'

vi.mock('@/api/goals', () => ({ postViewingSession: vi.fn() }))
const post = vi.mocked(postViewingSession)

const START = new Date('2026-10-15T09:00:00Z')

function setup(onRecorded?: () => void) {
  const hook = renderHook(() => useViewingTime('vid-1', onRecorded))
  const state = (s: number) => act(() => hook.result.current.onStateChange(s))
  const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))
  return { ...hook, state, wait }
}

const lastBody = () => post.mock.calls.at(-1)?.[0]
const seconds = () => lastBody()?.watched_seconds

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  post.mockReset()
  post.mockResolvedValue({ watched_seconds: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('counting playing time', () => {
  it('sends nothing until the video has played', async () => {
    const { state, wait, unmount } = setup()
    state(PlayerState.CUED)
    state(PlayerState.PAUSED)
    await wait(60_000)
    unmount()
    expect(post).not.toHaveBeenCalled()
  })

  it('reports the time played when the video is paused', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(10_000)
    state(PlayerState.PAUSED)
    expect(post).toHaveBeenCalledTimes(1)
    expect(lastBody()).toEqual({
      video_id: 'vid-1',
      started_at: START.toISOString(),
      watched_seconds: 10,
    })
  })

  it('does not count time spent paused', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(10_000)
    state(PlayerState.PAUSED)
    await wait(600_000) // ten minutes away from the keyboard
    state(PlayerState.PLAYING)
    await wait(5_000)
    state(PlayerState.PAUSED)
    expect(seconds()).toBe(15)
  })

  it('does not count buffering, which is what a seek looks like', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(4_000)
    state(PlayerState.BUFFERING)
    await wait(30_000)
    state(PlayerState.PLAYING)
    await wait(6_000)
    state(PlayerState.PAUSED)
    expect(seconds()).toBe(10)
  })

  it('keeps one session, with the same start, across pauses and a replay', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(5_000)
    state(PlayerState.PAUSED)
    await wait(2_000)
    state(PlayerState.PLAYING)
    await wait(5_000)
    state(PlayerState.ENDED)
    await wait(2_000)
    state(PlayerState.PLAYING) // replay
    await wait(3_000)
    state(PlayerState.PAUSED)
    const starts = new Set(post.mock.calls.map(([b]) => b.started_at))
    expect(starts.size).toBe(1)
    expect(seconds()).toBe(13)
  })

  it('a long frozen stretch cannot claim hours', async () => {
    const { state } = setup()
    state(PlayerState.PLAYING)
    act(() => void vi.setSystemTime(new Date(START.getTime() + 3 * 3600 * 1000))) // laptop slept
    state(PlayerState.PAUSED)
    expect(seconds()).toBeLessThanOrEqual(65)
  })
})

describe('when it is sent', () => {
  it('sends the running total every 15 seconds while playing', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(PING_INTERVAL_MS)
    expect(post).toHaveBeenCalledTimes(1)
    expect(seconds()).toBe(15)
    await wait(PING_INTERVAL_MS)
    expect(post).toHaveBeenCalledTimes(2)
    expect(seconds()).toBe(30)
  })

  it('stops pinging when playback stops', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(3_000)
    state(PlayerState.PAUSED)
    post.mockClear()
    await wait(PING_INTERVAL_MS * 4)
    expect(post).not.toHaveBeenCalled()
  })

  it('does not resend a total the server already has', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(5_000)
    state(PlayerState.PAUSED)
    await act(async () => void (await Promise.resolve()))
    state(PlayerState.PAUSED)
    state(PlayerState.CUED)
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('sends at most one request a second', async () => {
    const { state, wait } = setup()
    state(PlayerState.PLAYING)
    await wait(2_000)
    state(PlayerState.PAUSED) // sends
    await wait(100)
    state(PlayerState.PLAYING)
    await wait(1_000)
    state(PlayerState.PAUSED) // within a second of the last send
    expect(post.mock.calls.length).toBeLessThanOrEqual(2)
    await wait(1_000)
    expect(post.mock.calls.length).toBe(2)
    expect(seconds()).toBe(3)
  })

  it('sends on the way out with keepalive: tab hidden or closed, and leaving the video', async () => {
    const { state, wait, unmount } = setup()
    state(PlayerState.PLAYING)
    await wait(7_000)
    window.dispatchEvent(new Event('pagehide'))
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ watched_seconds: 7 }), {
      keepalive: true,
    })
    await wait(3_000)
    unmount()
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ watched_seconds: 10 }), {
      keepalive: true,
    })
  })

  it('tells the caller once the server has the time', async () => {
    const onRecorded = vi.fn()
    const { state, wait } = setup(onRecorded)
    state(PlayerState.PLAYING)
    await wait(4_000)
    state(PlayerState.PAUSED)
    await act(async () => void (await Promise.resolve()))
    expect(onRecorded).toHaveBeenCalledTimes(1)
  })
})

describe('when a request fails', () => {
  it('the next ping carries everything, so no time is lost or double counted', async () => {
    const { state, wait } = setup()
    post.mockRejectedValueOnce(new Error('offline'))
    state(PlayerState.PLAYING)
    await wait(PING_INTERVAL_MS) // fails
    await wait(PING_INTERVAL_MS) // succeeds with the full running total
    expect(post).toHaveBeenCalledTimes(2)
    expect(seconds()).toBe(30)
  })

  it('does not throw or interrupt playback', async () => {
    const { state, wait } = setup()
    post.mockRejectedValue(new Error('offline'))
    state(PlayerState.PLAYING)
    await wait(PING_INTERVAL_MS * 2)
    expect(() => state(PlayerState.PAUSED)).not.toThrow()
  })
})
