import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PathVideo } from '@/api/types'
import { PlayerState } from '@/lib/youtube'
import { FakePlayer, installFakeYouTube, uninstallFakeYouTube } from '@/test/fakeYouTube'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}

function pathVideo(over: Partial<PathVideo> & { id: string; position: number }): PathVideo {
  const { id, position, ...rest } = over
  return {
    position,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title: `Lesson ${position}`,
      channel_title: 'Example Academy',
      thumbnail_url: null,
      duration_seconds: 3130,
      availability_state: 'available',
    },
    learning_status: 'NOT_STARTED',
    last_position_seconds: 0,
    playback_pct: 0,
    ever_completed_at: null,
    last_watched_at: null,
    ...rest,
  }
}

const THREE = [
  pathVideo({ id: 'v1', position: 1 }),
  pathVideo({ id: 'v2', position: 2, learning_status: 'IN_PROGRESS', last_position_seconds: 125 }),
  pathVideo({ id: 'v3', position: 3 }),
]

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    ...ME,
    'GET /api/v1/learning-paths': {
      body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1', title: 'DSA' })] },
    },
    'GET /api/v1/learning-paths/p1': {
      body: makePath({
        id: 'p1',
        title: 'DSA',
        total_videos: 3,
        completed_videos: 1,
        in_progress_videos: 1,
        needs_revision_videos: 0,
        completion_pct: 33.3,
      }),
    },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: 3, limit: 500, offset: 0, items: THREE },
    },
    'PUT /api/v1/videos/': { body: {} },
    'POST /api/v1/viewing-sessions': { body: { watched_seconds: 0 } },
    'GET /api/v1/videos/v': { body: { video_id: 'v', body: '', revision: 0, updated_at: null } },
    ...extra,
  })
}

async function openProgressTab(route = '/learn/p1/v2') {
  const user = userEvent.setup()
  renderApp({ route })
  await screen.findByRole('heading', { level: 1 })
  await user.click(screen.getByRole('tab', { name: 'Progress' }))
  return user
}

async function playerReady() {
  await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0))
  const player = FakePlayer.last
  player.ready()
  return player
}

beforeEach(() => {
  window.sessionStorage.clear()
  installFakeYouTube()
})
afterEach(() => {
  uninstallFakeYouTube()
  document.head.querySelectorAll('script[src*="iframe_api"]').forEach((s) => s.remove())
})

describe('the Progress tab', () => {
  it('is a real panel, not a placeholder', async () => {
    api()
    await openProgressTab()
    const panel = within(screen.getByRole('tabpanel'))
    expect(panel.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(panel.getByRole('region', { name: 'This video' })).toBeInTheDocument()
    expect(panel.getByRole('region', { name: "Today's goal" })).toBeInTheDocument()
    expect(await panel.findByRole('region', { name: 'Learning path' })).toBeInTheDocument()
  })

  it('shows the status, the saved resume point and how much is left', async () => {
    api()
    await openProgressTab()
    const video = within(screen.getByRole('region', { name: 'This video' }))
    expect(video.getByText('In Progress')).toBeInTheDocument()
    expect(video.getByText('Resume point saved at 2:05')).toBeInTheDocument()
    expect(video.getByRole('progressbar', { name: 'Video progress' })).toBeInTheDocument()
  })

  it('follows the player while the video plays', async () => {
    api()
    await openProgressTab()
    const player = await playerReady()
    const video = within(screen.getByRole('region', { name: 'This video' }))

    player.setState(PlayerState.PLAYING)
    player.time = 300
    expect(await video.findByText('5:00', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(video.getByText('Playing')).toBeInTheDocument()

    player.time = 610
    expect(await video.findByText('10:10', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(video.getByRole('progressbar', { name: 'Video progress' })).toHaveAttribute(
      'aria-valuenow',
      '19',
    )
  })

  it('shows Paused and the position it stopped at', async () => {
    api()
    await openProgressTab()
    const player = await playerReady()
    player.setState(PlayerState.PLAYING)
    player.time = 900
    player.setState(PlayerState.PAUSED)
    const video = within(screen.getByRole('region', { name: 'This video' }))
    expect(await video.findByText('15:00')).toBeInTheDocument()
    expect(video.getByText('Paused')).toBeInTheDocument()
  })

  it('reflects a seek made while paused', async () => {
    api()
    await openProgressTab()
    const player = await playerReady()
    player.setState(PlayerState.PAUSED)
    player.time = 1200
    player.setState(PlayerState.BUFFERING)
    player.setState(PlayerState.PAUSED)
    const video = within(screen.getByRole('region', { name: 'This video' }))
    expect(await video.findByText('20:00')).toBeInTheDocument()
  })

  it('shows how far through the learning path the student is', async () => {
    api()
    await openProgressTab()
    const path = within(await screen.findByRole('region', { name: 'Learning path' }))
    expect(await path.findByText(/1 of 3 completed · 33%/)).toBeInTheDocument()
    expect(path.getByText(/Video 2 of 3/)).toBeInTheDocument()
    expect(path.getByRole('link', { name: 'DSA' })).toHaveAttribute('href', '/learning-paths/p1')
    expect(path.getByRole('link', { name: /Up next: Lesson 3/ })).toHaveAttribute(
      'href',
      '/learn/p1/v3',
    )
  })

  it("shows today's goal, with minutes that add up", async () => {
    api({
      'GET /api/v1/goals': {
        body: {
          daily_target_minutes: 60,
          timezone: 'UTC',
          today: '2026-10-15',
          today_watched_seconds: 125,
          week_watched_seconds: 125,
          daily: [],
          goal_achieved: false,
        },
      },
    })
    await openProgressTab()
    const goal = within(screen.getByRole('region', { name: "Today's goal" }))
    expect(await goal.findByText(/2/)).toBeInTheDocument()
    expect(goal.getByText(/\/ 60 min/)).toBeInTheDocument()
    expect(goal.getByText(/58 min to go/)).toBeInTheDocument()
  })

  it('says when the daily goal is reached', async () => {
    api({
      'GET /api/v1/goals': {
        body: {
          daily_target_minutes: 30,
          timezone: 'UTC',
          today: '2026-10-15',
          today_watched_seconds: 1900,
          week_watched_seconds: 1900,
          daily: [],
          goal_achieved: true,
        },
      },
    })
    await openProgressTab()
    const goal = within(screen.getByRole('region', { name: "Today's goal" }))
    expect(await goal.findByText(/Goal reached/)).toBeInTheDocument()
  })

  it('offers to set a goal when there is none', async () => {
    api()
    await openProgressTab()
    const goal = within(screen.getByRole('region', { name: "Today's goal" }))
    expect(await goal.findByRole('link', { name: 'Set a daily goal' })).toHaveAttribute(
      'href',
      '/goals',
    )
  })

  it('leaves out the path block for a video outside any path', async () => {
    const v = THREE[0]
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
      'GET /api/v1/videos/v1/notes': {
        body: { video_id: 'v1', body: '', revision: 0, updated_at: null },
      },
      'GET /api/v1/videos/v1': {
        body: {
          video: v.video,
          learning_status: 'NOT_STARTED',
          last_position_seconds: 0,
          playback_pct: 0,
          ever_completed_at: null,
          last_watched_at: null,
        },
      },
    })
    await openProgressTab('/learn/saved/v1')
    expect(screen.getByRole('region', { name: 'This video' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Learning path' })).not.toBeInTheDocument()
    expect(screen.getByText('No resume point saved yet')).toBeInTheDocument()
  })

  it('updates the path totals when the video is marked completed', async () => {
    let completed = 1
    api({
      'GET /api/v1/learning-paths/p1': () => ({
        body: makePath({
          id: 'p1',
          title: 'DSA',
          total_videos: 3,
          completed_videos: completed,
          completion_pct: (completed / 3) * 100,
        }),
      }),
      'PUT /api/v1/videos/v2/progress': () => {
        completed = 2
        return {
          body: {
            video_id: 'v2',
            learning_status: 'COMPLETED',
            last_position_seconds: 125,
            ever_completed_at: '2026-10-15T10:00:00Z',
            last_watched_at: null,
          },
        }
      },
    })
    const user = await openProgressTab()
    const path = within(await screen.findByRole('region', { name: 'Learning path' }))
    expect(await path.findByText(/1 of 3 completed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark completed' }))
    expect(await path.findByText(/2 of 3 completed/)).toBeInTheDocument()
  })
})
