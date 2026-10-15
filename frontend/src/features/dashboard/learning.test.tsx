import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardLearning, LearningItem } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': {
    body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1', title: 'Algorithms' })] },
  },
}

function item(over: Partial<LearningItem> & { id: string; title: string }): LearningItem {
  const { id, title, ...rest } = over
  return {
    video_id: id,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title,
      channel_title: 'Example Academy',
      thumbnail_url: null,
      duration_seconds: 3130,
      availability_state: 'available',
    },
    path: { id: 'p1', title: 'Algorithms' },
    learning_status: 'IN_PROGRESS',
    last_position_seconds: 1565,
    playback_pct: 50,
    last_watched_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    ...rest,
  }
}

const dash = (d: Partial<DashboardLearning>) => ({
  'GET /api/v1/dashboard': {
    body: { continue_learning: null, recently_watched: [], ...d } as DashboardLearning,
  },
})

const continueRegion = async () =>
  within(await screen.findByRole('region', { name: 'Continue Learning' }))
const recentPanel = async () =>
  within(
    (await screen.findByRole('heading', { name: 'Recently Watched' })).closest(
      'section',
    ) as HTMLElement,
  )

describe('continue learning', () => {
  it('shows the video to pick up, with its progress and a Resume link', async () => {
    mockApi({
      ...ME,
      ...dash({ continue_learning: item({ id: 'v1', title: 'Binary Search' }) }),
    })
    renderApp()
    const region = await continueRegion()
    expect(await region.findByRole('heading', { name: 'Binary Search' })).toBeInTheDocument()
    expect(region.getByText(/Algorithms · Example Academy/)).toBeInTheDocument()
    expect(region.getByRole('progressbar', { name: 'Binary Search progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    expect(region.getByText(/50% · 26:05 of 52:10/)).toBeInTheDocument()
    expect(region.getByText(/Last watched 2 hours ago/)).toBeInTheDocument()
    expect(region.getByRole('link', { name: 'Resume Binary Search' })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
  })

  it('opens a video that is in no path as a saved video', async () => {
    mockApi({
      ...ME,
      ...dash({ continue_learning: item({ id: 'v9', title: 'Loose', path: null }) }),
    })
    renderApp()
    const region = await continueRegion()
    expect(await region.findByRole('link', { name: 'Resume Loose' })).toHaveAttribute(
      'href',
      '/learn/saved/v9',
    )
    expect(region.getByText(/Saved video/)).toBeInTheDocument()
  })

  it('says where the student left off when the length is unknown', async () => {
    const base = item({ id: 'v1', title: 'Live stream' })
    mockApi({
      ...ME,
      ...dash({
        continue_learning: {
          ...base,
          playback_pct: null,
          video: { ...base.video, duration_seconds: null },
        },
      }),
    })
    renderApp()
    const region = await continueRegion()
    expect(await region.findByText(/Left off at 26:05/)).toBeInTheDocument()
    expect(region.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('points the way when nothing is in progress', async () => {
    mockApi({ ...ME })
    renderApp()
    const region = await continueRegion()
    expect(await region.findByText(/not partway through a video/)).toBeInTheDocument()
    expect(region.getByRole('link', { name: 'Browse paths' })).toHaveAttribute(
      'href',
      '/learning-paths',
    )
  })

  it('does not block the rest of the dashboard when it cannot load', async () => {
    mockApi({ ...ME, 'GET /api/v1/dashboard': { status: 500 } })
    renderApp()
    const region = await continueRegion()
    expect(await region.findByText(/couldn't load where you left off/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your Learning Paths' })).toBeInTheDocument()
  })
})

describe('recently watched', () => {
  it('lists the latest videos, each opening in its path, without repeating the one above', async () => {
    const first = item({ id: 'v1', title: 'Binary Search' })
    mockApi({
      ...ME,
      ...dash({
        continue_learning: first,
        recently_watched: [
          first,
          item({
            id: 'v2',
            title: 'Sorting',
            last_watched_at: new Date(Date.now() - 86400e3).toISOString(),
          }),
          item({ id: 'v3', title: 'Loose video', path: null }),
        ],
      }),
    })
    renderApp()
    const panel = await recentPanel()
    expect(await panel.findByRole('link', { name: /Sorting/ })).toHaveAttribute(
      'href',
      '/learn/p1/v2',
    )
    expect(panel.getByRole('link', { name: /Loose video/ })).toHaveAttribute(
      'href',
      '/learn/saved/v3',
    )
    expect(panel.getByText(/Algorithms · yesterday/)).toBeInTheDocument()
    expect(panel.queryByText('Binary Search')).not.toBeInTheDocument() // already shown above
  })

  it('invites the student to start when nothing has been watched', async () => {
    mockApi({ ...ME })
    renderApp()
    const panel = await recentPanel()
    await waitFor(() =>
      expect(panel.getByText(/Videos you watch will show up here/)).toBeInTheDocument(),
    )
  })

  it('says so when the history cannot be loaded', async () => {
    mockApi({ ...ME, 'GET /api/v1/dashboard': { status: 500 } })
    renderApp()
    const panel = await recentPanel()
    expect(await panel.findByText(/couldn't load your recent videos/)).toBeInTheDocument()
  })
})

describe('learning paths section', () => {
  it('keeps the path cards and a View all link', async () => {
    const user = userEvent.setup()
    mockApi({ ...ME })
    renderApp()
    const region = within(await screen.findByRole('region', { name: 'Your Learning Paths' }))
    expect(
      await region.findByRole('progressbar', { name: 'Algorithms progress' }),
    ).toBeInTheDocument()
    await user.click(region.getByRole('link', { name: 'View all' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/learning-paths')
  })
})

describe('learning time', () => {
  it('shows today and this week', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals': {
        body: {
          daily_target_minutes: null,
          timezone: 'UTC',
          today: '2026-10-15',
          today_watched_seconds: 2520,
          week_watched_seconds: 9000,
          goal_achieved: false,
        },
      },
    })
    renderApp()
    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    await waitFor(() => {
      const card = summary.getByText('Learning Time').parentElement
      expect(card).toHaveTextContent('42 min')
      expect(card).toHaveTextContent('2 h 30 min this week')
    })
  })
})
