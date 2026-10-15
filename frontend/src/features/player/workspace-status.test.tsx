import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PathVideo } from '@/api/types'
import { PlayerState } from '@/lib/youtube'
import { FakePlayer, installFakeYouTube, uninstallFakeYouTube } from '@/test/fakeYouTube'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

function item(over: Partial<PathVideo> = {}): PathVideo {
  return {
    position: 1,
    video: {
      id: 'v1',
      youtube_video_id: 'abcdefghijk',
      title: 'Lesson 1',
      channel_title: 'Example Academy',
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    learning_status: 'IN_PROGRESS',
    last_position_seconds: 0,
    playback_pct: 0,
    ever_completed_at: null,
    last_watched_at: null,
    ...over,
  }
}

function api(over: Partial<PathVideo>, put: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/me': {
      body: { id: 'u', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
    },
    'GET /api/v1/learning-paths': {
      body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1', title: 'DSA' })] },
    },
    'GET /api/v1/learning-paths/p1': { body: makePath({ id: 'p1', title: 'DSA' }) },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: 1, limit: 500, offset: 0, items: [item(over)] },
    },
    'GET /api/v1/videos/v1/notes': {
      body: { video_id: 'v1', body: '', revision: 0, updated_at: null },
    },
    'PUT /api/v1/videos/v1/progress': { body: {} },
    ...put,
  })
}

const group = () => screen.getByRole('group', { name: 'Learning status' })
const button = (name: string) => within(group()).getByRole('button', { name })

beforeEach(() => installFakeYouTube())
afterEach(() => {
  uninstallFakeYouTube()
  document.head.querySelectorAll('script[src*="iframe_api"]').forEach((s) => s.remove())
})

async function open() {
  renderApp({ route: '/learn/p1/v1' })
  await screen.findByRole('heading', { level: 1 })
  await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0))
  const player = FakePlayer.last
  player.ready()
  return player
}

describe('learning status controls', () => {
  it('marks the video completed', async () => {
    const user = userEvent.setup()
    const mock = api(
      {},
      {
        'PUT /api/v1/videos/v1/progress': { body: { learning_status: 'COMPLETED' } },
      },
    )
    await open()
    await user.click(button('Mark completed'))

    await waitFor(() => expect(button('Completed')).toBeDisabled())
    expect(mock.calls.find((c) => c.method === 'PUT')?.body).toEqual({
      learning_status: 'COMPLETED',
    })
  })

  it('flags the video as needing revision', async () => {
    const user = userEvent.setup()
    api(
      { learning_status: 'COMPLETED' },
      { 'PUT /api/v1/videos/v1/progress': { body: { learning_status: 'NEEDS_REVISION' } } },
    )
    await open()
    await user.click(button('Needs revision'))
    await waitFor(() => expect(button('Needs revision')).toBeDisabled())
    expect(button('Needs revision')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an error and leaves the status alone when the change fails', async () => {
    const user = userEvent.setup()
    api({}, { 'PUT /api/v1/videos/v1/progress': { fail: true } })
    await open()
    await user.click(button('Mark completed'))
    expect(await screen.findByText(/Couldn't update the status/)).toBeInTheDocument()
    expect(button('Mark completed')).toBeEnabled()
  })
})

function serverRules() {
  // The server decides: only an unseeked ending completes the video.
  return {
    'PUT /api/v1/videos/v1/progress': (init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body))
      const done = sent.playback_ended && !sent.session_seeked
      return { body: { learning_status: done ? 'COMPLETED' : 'IN_PROGRESS' } }
    },
  }
}

async function playTo(player: FakePlayer, from: number, to: number) {
  player.time = from
  act(() => player.setState(PlayerState.PLAYING))
  for (let t = from + 1; t <= to; t++) {
    player.time = t
    await act(async () => void vi.advanceTimersByTime(1000))
  }
}

describe('finishing a video', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('completes it after watching through to the end', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const mock = api({ last_position_seconds: 580 }, serverRules())
    const player = await open()
    await user.click(await screen.findByRole('button', { name: 'Resume' }))

    await playTo(player, 580, 600)
    act(() => player.setState(PlayerState.ENDED))

    await waitFor(() => expect(button('Completed')).toBeDisabled())
    const ended = mock.calls.find((c) => (c.body as { playback_ended?: boolean })?.playback_ended)
    expect(ended?.body).toMatchObject({ session_seeked: false, last_position_seconds: 600 })
  })

  it('does not complete it when the student skipped to the end', async () => {
    const mock = api({}, serverRules())
    const player = await open()

    await playTo(player, 0, 3)
    player.time = 599 // dragged the bar to the end
    await act(async () => void vi.advanceTimersByTime(1000))
    player.time = 600
    act(() => player.setState(PlayerState.ENDED))

    await waitFor(() =>
      expect(mock.calls.some((c) => (c.body as { playback_ended?: boolean })?.playback_ended)).toBe(
        true,
      ),
    )
    const ended = mock.calls.find((c) => (c.body as { playback_ended?: boolean })?.playback_ended)
    expect(ended?.body).toMatchObject({ session_seeked: true })
    await act(async () => void vi.advanceTimersByTime(100))
    expect(button('Mark completed')).toBeEnabled()
  })
})
