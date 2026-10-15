import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PathVideo, RevisionState } from '@/api/types'
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

function revision(over: Partial<RevisionState> = {}): RevisionState {
  return {
    video_id: 'v1',
    learning_status: 'NEEDS_REVISION',
    active: false,
    due_at: '2026-10-16',
    flagged_at: '2026-10-15T10:00:00Z',
    revised_at: null,
    due_state: 'upcoming',
    today: '2026-10-15',
    ...over,
  }
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

  it('flags the video for revision and shows when it is due', async () => {
    const user = userEvent.setup()
    let active = false
    const mock = api(
      { learning_status: 'COMPLETED' },
      {
        'PUT /api/v1/videos/v1/revision': () => {
          active = true
          return { body: revision({ active: true }) }
        },
        'GET /api/v1/videos/v1/revision': () => ({ body: revision({ active }) }),
      },
    )
    await open()
    await user.click(await within(group()).findByRole('button', { name: 'Needs revision' }))

    expect(await within(group()).findByText(/Needs revision · Due tomorrow/)).toBeInTheDocument()
    expect(within(group()).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
    expect(within(group()).getByRole('button', { name: 'Mark revised' })).toBeInTheDocument()
    // The badge follows the server's status.
    expect(
      within(screen.getByRole('region', { name: 'Playback progress' })).getByText('Needs Revision'),
    ).toBeInTheDocument()
    expect(mock.calls.find((c) => c.method === 'PUT' && c.url.endsWith('/revision'))?.body).toEqual(
      expect.objectContaining({ timezone: expect.any(String) }),
    )
  })

  it('choosing Mark completed takes the video out of the revision queue view', async () => {
    const user = userEvent.setup()
    let active = true
    api(
      { learning_status: 'NEEDS_REVISION' },
      {
        'GET /api/v1/videos/v1/revision': () => ({
          body: revision({ active, learning_status: active ? 'NEEDS_REVISION' : 'COMPLETED' }),
        }),
        'PUT /api/v1/videos/v1/progress': () => {
          active = false // the server closes the revision when the status changes
          return { body: { learning_status: 'COMPLETED' } }
        },
      },
    )
    await open()
    expect(await within(group()).findByText(/Needs revision · Due tomorrow/)).toBeInTheDocument()
    await user.click(button('Mark completed'))
    await waitFor(() =>
      expect(within(group()).queryByText(/Needs revision · Due/)).not.toBeInTheDocument(),
    )
    expect(within(group()).getByRole('button', { name: 'Needs revision' })).toBeInTheDocument()
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

describe('viewing time', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('records the time the video was playing, and nothing for the time paused', async () => {
    const mock = api({}, { 'POST /api/v1/viewing-sessions': { body: { watched_seconds: 6 } } })
    const player = await open()

    await playTo(player, 0, 6)
    act(() => player.setState(PlayerState.PAUSED))
    await act(async () => void vi.advanceTimersByTime(120_000)) // two minutes paused

    await waitFor(() =>
      expect(mock.calls.some((c) => c.url.endsWith('/api/v1/viewing-sessions'))).toBe(true),
    )
    const sent = mock.calls.filter((c) => c.url.endsWith('/api/v1/viewing-sessions'))
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toMatchObject({ video_id: 'v1', watched_seconds: 6 })
    expect((sent[0].body as { started_at: string }).started_at).toMatch(/Z$/)
  })
})

describe('saving a video', () => {
  it('offers a Save button that bookmarks the video being watched', async () => {
    const user = userEvent.setup()
    let saved = false
    const mock = api(
      {},
      {
        'GET /api/v1/videos/v1/saved': () => ({
          body: { video_id: 'v1', saved, saved_at: saved ? '2026-10-15T10:00:00Z' : null },
        }),
        'PUT /api/v1/videos/v1/saved': () => {
          saved = true
          return { body: { video_id: 'v1', saved: true, saved_at: '2026-10-15T10:00:00Z' } }
        },
      },
    )
    await open()
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument()
    expect(mock.calls.some((c) => c.method === 'PUT' && c.url.endsWith('/videos/v1/saved'))).toBe(
      true,
    )
  })
})
