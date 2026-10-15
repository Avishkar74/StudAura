import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PathVideo } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: {
      id: 'user-1',
      email: 'ada@example.test',
      display_name: 'Ada',
      created_at: '',
    },
  },
}
const PATH = makePath({
  id: 'p1',
  title: 'Data Structures',
  description: 'The classics',
  total_videos: 3,
  completed_videos: 1,
  in_progress_videos: 1,
  needs_revision_videos: 1,
  completion_pct: 33.3,
})
const DONE = {
  learning_status: 'COMPLETED',
  ever_completed_at: '2026-10-01T00:00:00Z',
} as const

function row(id: string, position: number, over: Partial<PathVideo> = {}): PathVideo {
  return {
    position,
    video: {
      id,
      youtube_video_id: `yt-${id}`,
      title: `Lesson ${position}`,
      channel_title: null,
      thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration_seconds: 3130,
      availability_state: 'available',
    },
    learning_status: 'NOT_STARTED',
    last_position_seconds: 0,
    playback_pct: 0,
    ever_completed_at: null,
    last_watched_at: null,
    ...over,
  }
}

function api(items: PathVideo[], path = PATH) {
  return mockApi({
    ...ME,
    'GET /api/v1/learning-paths': {
      body: { total: 1, limit: 100, offset: 0, items: [path] },
    },
    'GET /api/v1/learning-paths/p1': { body: path },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: items.length, limit: 500, offset: 0, items },
    },
  })
}

const LOADED = [
  row('v1', 1, { ...DONE, playback_pct: 100 }),
  row('v2', 2, {
    learning_status: 'IN_PROGRESS',
    playback_pct: 64,
    last_watched_at: '2026-10-14T10:00:00Z',
  }),
  row('v3', 3, {
    learning_status: 'NEEDS_REVISION',
    ever_completed_at: '2026-09-20T00:00:00Z',
    playback_pct: 0,
  }),
]

describe('learning path page', () => {
  it('shows the path summary and every video with its status', async () => {
    api(LOADED)
    renderApp({ route: '/learning-paths/p1' })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Data Structures' }),
    ).toBeInTheDocument()
    expect(screen.getByText('The classics')).toBeInTheDocument()
    expect(screen.getByText(/1 of 3 completed · 33%/)).toBeInTheDocument()

    const list = within(await screen.findByRole('list', { name: 'Videos' }))
    const rows = list.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Completed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('In Progress')).toBeInTheDocument()
    expect(within(rows[1]).getByText('64% watched')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Needs Revision')).toBeInTheDocument()
    expect(within(rows[0]).getByText('52:10')).toBeInTheDocument() // duration
  })

  it('opens a video in the workspace from its title', async () => {
    api(LOADED)
    renderApp({ route: '/learning-paths/p1' })
    const list = within(await screen.findByRole('list', { name: 'Videos' }))
    expect(list.getByRole('link', { name: 'Lesson 2' })).toHaveAttribute('href', '/learn/p1/v2')
    expect(list.getByRole('link', { name: 'Open Lesson 3' })).toHaveAttribute(
      'href',
      '/learn/p1/v3',
    )
  })

  it('Continue Learning opens the video the student was in the middle of', async () => {
    api(LOADED)
    renderApp({ route: '/learning-paths/p1' })
    const button = await screen.findByRole('link', {
      name: 'Continue Learning',
    })
    expect(button).toHaveAttribute('href', '/learn/p1/v2')
  })

  it('offers a review when every video is completed', async () => {
    api([row('v1', 1, DONE), row('v2', 2, DONE)])
    renderApp({ route: '/learning-paths/p1' })
    expect(await screen.findByRole('link', { name: 'Review Completed Videos' })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
  })

  it('flags a video whose owner blocked embedding', async () => {
    const blocked = row('v1', 1)
    blocked.video.availability_state = 'embed_disabled'
    api([blocked])
    renderApp({ route: '/learning-paths/p1' })
    expect(await screen.findByText("Can't be embedded")).toBeInTheDocument()
  })

  it('explains an empty path and offers both ways to fill it', async () => {
    api(
      [],
      makePath({
        id: 'p1',
        title: 'Empty',
        total_videos: 0,
        completed_videos: 0,
        completion_pct: 0,
      }),
    )
    renderApp({ route: '/learning-paths/p1' })

    expect(await screen.findByRole('heading', { name: 'No videos yet.' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue Learning|Review/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a video' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import a playlist' })).toBeInTheDocument()
  })

  it('Add video opens the dialog with this path already selected', async () => {
    const user = userEvent.setup()
    api(LOADED)
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Add video' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add YouTube video' }))
    expect(await dialog.findByLabelText('Learning path')).toHaveValue('p1')
  })

  it('Import playlist opens its dialog', async () => {
    const user = userEvent.setup()
    api(LOADED)
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Import playlist' }))
    expect(
      await screen.findByRole('dialog', { name: 'Import YouTube playlist' }),
    ).toBeInTheDocument()
  })

  it('says when the path does not exist', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': {
        body: { total: 0, limit: 100, offset: 0, items: [] },
      },
      'GET /api/v1/learning-paths/p1': {
        status: 404,
        body: {
          error: {
            code: 'NOT_FOUND',
            message: 'Learning path not found',
            details: [],
          },
        },
      },
    })
    renderApp({ route: '/learning-paths/p1' })
    expect(
      await screen.findByRole('heading', { name: 'Learning path not found' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All learning paths' })).toBeInTheDocument()
  })

  it('offers a retry when the videos fail to load', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': {
        body: { total: 1, limit: 100, offset: 0, items: [PATH] },
      },
      'GET /api/v1/learning-paths/p1': { body: PATH },
      'GET /api/v1/learning-paths/p1/videos': () =>
        ++attempts === 1
          ? { status: 500, body: {} }
          : {
              body: { total: 1, limit: 500, offset: 0, items: [row('v1', 1)] },
            },
    })
    renderApp({ route: '/learning-paths/p1' })
    expect(await screen.findByText("Couldn't load the videos.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Lesson 1' })).toBeInTheDocument()
  })
})
