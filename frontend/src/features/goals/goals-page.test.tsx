import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardLearning, Goal, PathDeadline } from '@/api/types'
import { mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
}

// Thursday 15 Oct 2026 is "today"; the week runs Fri 9 to Thu 15.
const DAYS = [
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
]

function goal(seconds: number[], target: number | null = 60): Goal {
  return {
    daily_target_minutes: target,
    timezone: 'UTC',
    today: '2026-10-15',
    today_watched_seconds: seconds[6],
    week_watched_seconds: seconds.reduce((a, b) => a + b, 0),
    daily: DAYS.map((date, i) => ({ date, watched_seconds: seconds[i] })),
    goal_achieved: target !== null && seconds[6] >= target * 60,
  }
}

const section = async (name: string) =>
  within((await screen.findByRole('heading', { name })).closest('section') as HTMLElement)

function deadline(over: Partial<PathDeadline> = {}): PathDeadline {
  return {
    path_id: 'p1',
    title: 'DSA',
    target_date: '2026-10-25',
    remaining_videos: 3,
    remaining_seconds: 72_000,
    videos_without_duration: 0,
    days_remaining: 10,
    minutes_per_day: 120,
    ...over,
  }
}

describe('Daily Goals page', () => {
  it("shows today's goal and a bar for each of the last seven days", async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals': { body: goal([0, 1800, 0, 3600, 600, 0, 2520]) },
    })
    renderApp({ route: '/goals' })
    expect(await screen.findByRole('heading', { name: 'Daily Goals' })).toBeInTheDocument()

    const today = await section("Today's goal")
    expect(await today.findByText(/18 min remaining/)).toBeInTheDocument()

    const week = await section('This week')
    expect(await week.findByText(/2 h 22 min in the last 7 days/)).toBeInTheDocument()
    const bars = week.getAllByRole('listitem')
    expect(bars).toHaveLength(7)
    expect(bars[0]).toHaveAccessibleName('Fri: 0 min')
    expect(bars[3]).toHaveAccessibleName('Mon: 1 h, goal reached')
    expect(bars[6]).toHaveAccessibleName('Today: 42 min')
  })

  it('draws the week without a goal line when there is no goal', async () => {
    mockApi({ ...ME, 'GET /api/v1/goals': { body: goal([0, 0, 0, 0, 0, 0, 900], null) } })
    renderApp({ route: '/goals' })
    const week = await section('This week')
    expect(await week.findByText(/15 min in the last 7 days/)).toBeInTheDocument()
    expect(week.queryByText(/dashed line is your goal/)).not.toBeInTheDocument()
  })

  it('lists what to do today: the video to continue and revisions that are due', async () => {
    const watched: DashboardLearning = {
      continue_learning: {
        video_id: 'v1',
        video: {
          id: 'v1',
          youtube_video_id: 'ytv1xxxxxxx',
          title: 'Binary Search',
          channel_title: null,
          thumbnail_url: null,
          duration_seconds: 3130,
          availability_state: 'available',
        },
        path: { id: 'p1', title: 'DSA' },
        learning_status: 'IN_PROGRESS',
        last_position_seconds: 1565,
        playback_pct: 50,
        last_watched_at: '2026-10-15T10:00:00Z',
      },
      recently_watched: [],
    }
    mockApi({
      ...ME,
      'GET /api/v1/dashboard': { body: watched },
      'GET /api/v1/revisions': {
        body: {
          today: '2026-10-15',
          timezone: 'UTC',
          total: 2,
          due_count: 1,
          items: [
            {
              video_id: 'v2',
              video: { ...watched.continue_learning!.video, id: 'v2', title: 'Scheduling' },
              path: null,
              due_at: '2026-10-15',
              flagged_at: '2026-10-14T10:00:00Z',
              due_state: 'due_today',
            },
            {
              video_id: 'v3',
              video: { ...watched.continue_learning!.video, id: 'v3', title: 'Later one' },
              path: null,
              due_at: '2026-10-20',
              flagged_at: '2026-10-14T10:00:00Z',
              due_state: 'upcoming',
            },
          ],
        },
      },
    })
    renderApp({ route: '/goals' })
    const plan = await section('Up next today')
    expect(await plan.findByRole('link', { name: /Binary Search/ })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    expect(plan.getByText(/Continue · DSA · 50% watched/)).toBeInTheDocument()
    expect(plan.getByRole('link', { name: /Scheduling/ })).toHaveAttribute(
      'href',
      '/learn/saved/v2',
    )
    expect(plan.getByText(/Revision · Due today/)).toBeInTheDocument()
    expect(plan.queryByText('Later one')).not.toBeInTheDocument() // not due yet
  })

  it('points the way when nothing is waiting', async () => {
    mockApi({ ...ME })
    renderApp({ route: '/goals' })
    const plan = await section('Up next today')
    expect(await plan.findByText(/Nothing is waiting for you/)).toBeInTheDocument()
  })

  it('shows what each target date needs, labelled as an estimate', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals/deadlines': {
        body: [
          deadline(),
          deadline({
            path_id: 'p2',
            title: 'Networks',
            target_date: '2026-10-17',
            remaining_videos: 1,
            remaining_seconds: 1200,
            videos_without_duration: 2,
            days_remaining: 2,
            minutes_per_day: 10,
          }),
        ],
      },
    })
    renderApp({ route: '/goals' })
    const list = await section('Learning-path deadlines')
    expect(await list.findByRole('link', { name: 'DSA' })).toHaveAttribute(
      'href',
      '/learning-paths/p1',
    )
    expect(list.getByText(/Target Oct 25, 2026 · 10 days left/)).toBeInTheDocument()
    expect(list.getByText(/20 h left across 3 videos/)).toBeInTheDocument()
    expect(list.getByText(/≈ 2 h a day/)).toBeInTheDocument()
    expect(list.getAllByText(/\(estimate\)/)).toHaveLength(2)
    expect(
      list.getByText(/2 videos have no known length, so they aren't included/),
    ).toBeInTheDocument()
    expect(list.getByText(/Target Oct 17, 2026 · 2 days left/)).toBeInTheDocument()
    expect(list.getByText(/≈ 10 min a day/)).toBeInTheDocument()
  })

  it('gives no pace for a date that has arrived or passed', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals/deadlines': {
        body: [
          deadline({ title: 'Today path', days_remaining: 0, minutes_per_day: null }),
          deadline({ path_id: 'p2', title: 'Missed', days_remaining: -3, minutes_per_day: null }),
        ],
      },
    })
    renderApp({ route: '/goals' })
    const list = await section('Learning-path deadlines')
    expect(await list.findByText(/Target date is today/)).toBeInTheDocument()
    expect(list.getByText(/Target date passed 3 days ago/)).toBeInTheDocument()
    expect(list.queryByText(/a day/)).not.toBeInTheDocument()
  })

  it('invites the student to set a target date when there are none', async () => {
    mockApi({ ...ME })
    renderApp({ route: '/goals' })
    const list = await section('Learning-path deadlines')
    expect(await list.findByText(/Give a learning path a target date/)).toBeInTheDocument()
  })

  it('offers a retry when deadlines cannot be loaded, without hiding the rest', async () => {
    mockApi({ ...ME, 'GET /api/v1/goals/deadlines': { status: 500 } })
    renderApp({ route: '/goals' })
    const list = await section('Learning-path deadlines')
    expect(await list.findByRole('alert')).toHaveTextContent(/Couldn't load your deadlines/)
    expect(await section("Today's goal")).toBeTruthy()
  })

  it('says so when the week cannot be loaded', async () => {
    mockApi({ ...ME, 'GET /api/v1/goals': { status: 500 } })
    renderApp({ route: '/goals' })
    const week = await section('This week')
    expect(await week.findByText(/couldn't load your week/)).toBeInTheDocument()
  })
})
