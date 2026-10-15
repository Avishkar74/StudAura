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
    body: {
      id: 'user-1',
      email: 'ada@example.test',
      display_name: 'Ada',
      created_at: '',
    },
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
  pathVideo({ id: 'v2', position: 2 }),
  pathVideo({ id: 'v3', position: 3 }),
]

function api(items: PathVideo[], extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    ...ME,
    'GET /api/v1/learning-paths': {
      body: {
        total: 1,
        limit: 100,
        offset: 0,
        items: [makePath({ id: 'p1', title: 'DSA' })],
      },
    },
    'GET /api/v1/learning-paths/p1': {
      body: makePath({ id: 'p1', title: 'DSA' }),
    },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: items.length, limit: 500, offset: 0, items },
    },
    'PUT /api/v1/videos/': { body: {} },
    ...extra,
  })
}

async function openWorkspace(route = '/learn/p1/v2') {
  const utils = renderApp({ route })
  await screen.findByRole('heading', { level: 1 })
  return utils
}

async function playerReady() {
  await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0))
  const player = FakePlayer.last
  player.ready()
  return player
}

beforeEach(() => installFakeYouTube())
afterEach(() => {
  uninstallFakeYouTube()
  document.head.querySelectorAll('script[src*="iframe_api"]').forEach((s) => s.remove())
})

describe('the player', () => {
  it('embeds the video with the privacy-enhanced host and shows its details', async () => {
    api(THREE)
    await openWorkspace()
    const player = await playerReady()

    expect(player.options.videoId).toBe(THREE[1].video.youtube_video_id)
    expect(player.options.host).toBe('https://www.youtube-nocookie.com')
    expect(screen.getByRole('heading', { level: 1, name: 'Lesson 2' })).toBeInTheDocument()
    expect(screen.getByText('Example Academy')).toBeInTheDocument()
    expect(FakePlayer.instances).toHaveLength(1)
  })

  it('destroys the player when leaving the video', async () => {
    api(THREE)
    const { unmount } = await openWorkspace()
    const player = await playerReady()
    unmount()
    expect(player.destroyed).toBe(true)
  })

  it('shows previous and next links within the path', async () => {
    api(THREE)
    await openWorkspace('/learn/p1/v2')
    const nav = within(screen.getByRole('navigation', { name: 'Videos in this path' }))
    expect(nav.getByRole('link', { name: /Previous: Lesson 1/ })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    expect(nav.getByRole('link', { name: /Next: Lesson 3/ })).toHaveAttribute(
      'href',
      '/learn/p1/v3',
    )
  })

  it('has no previous link on the first video and no next link on the last', async () => {
    api(THREE)
    const first = await openWorkspace('/learn/p1/v1')
    expect(screen.queryByRole('link', { name: /Previous:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: Lesson 2/ })).toBeInTheDocument()
    first.unmount()

    await openWorkspace('/learn/p1/v3')
    expect(screen.queryByRole('link', { name: /Next:/ })).not.toBeInTheDocument()
  })

  it('links back to the learning path by name', async () => {
    api(THREE)
    await openWorkspace()
    const main = within(screen.getByRole('main'))
    expect(await main.findByRole('link', { name: 'DSA' })).toHaveAttribute(
      'href',
      '/learning-paths/p1',
    )
  })
})

describe('videos that cannot be played', () => {
  it('shows the fallback for a video whose owner disabled embedding', async () => {
    const blocked = pathVideo({ id: 'v1', position: 1 })
    blocked.video.availability_state = 'embed_disabled'
    api([blocked])
    await openWorkspace('/learn/p1/v1')

    expect(screen.getByRole('alert')).toHaveTextContent("This video can't be played here.")
    expect(screen.getByRole('alert')).toHaveTextContent('Your notes and progress are kept.')
    const link = screen.getByRole('link', { name: /Watch on YouTube/ })
    expect(link).toHaveAttribute(
      'href',
      `https://www.youtube.com/watch?v=${blocked.video.youtube_video_id}`,
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(FakePlayer.instances).toHaveLength(0) // no player is even created
  })

  it.each([2, 5, 100, 101, 150])('falls back when the player reports error %i', async (code) => {
    api(THREE)
    await openWorkspace()
    const player = await playerReady()
    player.error(code)
    expect(await screen.findByRole('alert')).toHaveTextContent("This video can't be played here.")
  })

  it('explains when the player script cannot be loaded at all', async () => {
    uninstallFakeYouTube() // no window.YT: the loader injects the script tag
    api(THREE)
    await openWorkspace()
    await waitFor(() =>
      expect(document.head.querySelector('script[src*="iframe_api"]')).not.toBeNull(),
    )
    const script = document.head.querySelector('script[src*="iframe_api"]') as HTMLScriptElement
    script.onerror?.(new Event('error'))
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be loaded")
    expect(screen.getByRole('link', { name: /Watch on YouTube/ })).toBeInTheDocument()
  })
})

describe('resume prompt', () => {
  const resumable = [
    pathVideo({
      id: 'v1',
      position: 1,
      learning_status: 'IN_PROGRESS',
      last_position_seconds: 750,
      playback_pct: 24,
    }),
  ]

  it('offers to resume from the saved position', async () => {
    api(resumable)
    await openWorkspace('/learn/p1/v1')
    const prompt = within(screen.getByRole('region', { name: 'Resume playback' }))
    expect(prompt.getByText('12:30')).toBeInTheDocument()
  })

  it('Resume jumps to the saved position and plays', async () => {
    const user = userEvent.setup()
    api(resumable)
    await openWorkspace('/learn/p1/v1')
    const player = await playerReady()

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(player.seekTo).toHaveBeenCalledWith(750, true)
    expect(player.playVideo).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Resume playback' })).not.toBeInTheDocument()
  })

  it('Start over rewinds, plays, and remembers 0:00', async () => {
    const user = userEvent.setup()
    const calls = api(resumable)
    await openWorkspace('/learn/p1/v1')
    const player = await playerReady()

    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(player.seekTo).toHaveBeenCalledWith(0, true)
    expect(player.playVideo).toHaveBeenCalled()
    await waitFor(() => {
      const put = calls.calls.find((c) => c.method === 'PUT')
      expect(put?.body).toEqual({ last_position_seconds: 0 })
    })
  })

  it('waits for the player before enabling the buttons', async () => {
    api(resumable)
    await openWorkspace('/learn/p1/v1')
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
    await playerReady()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled())
  })

  it('disappears once the student presses play themselves', async () => {
    api(resumable)
    await openWorkspace('/learn/p1/v1')
    const player = await playerReady()
    player.setState(PlayerState.PLAYING)
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Resume playback' })).not.toBeInTheDocument(),
    )
  })

  it.each([
    ['nothing saved', 0],
    ['barely started', 4],
    ['at the very end', 3125],
  ])('is not offered when %s', async (_name, position) => {
    api([pathVideo({ id: 'v1', position: 1, last_position_seconds: position })])
    await openWorkspace('/learn/p1/v1')
    expect(screen.queryByRole('region', { name: 'Resume playback' })).not.toBeInTheDocument()
  })

  it('is not offered on a video that cannot be played', async () => {
    const blocked = pathVideo({
      id: 'v1',
      position: 1,
      last_position_seconds: 750,
    })
    blocked.video.availability_state = 'embed_disabled'
    api([blocked])
    await openWorkspace('/learn/p1/v1')
    expect(screen.queryByRole('region', { name: 'Resume playback' })).not.toBeInTheDocument()
  })
})

describe('saving progress', () => {
  it('saves the position when the student pauses and shows it', async () => {
    const calls = api(THREE)
    await openWorkspace('/learn/p1/v1')
    const player = await playerReady()

    player.setState(PlayerState.PLAYING)
    player.time = 1565 // half of 3130 seconds
    player.setState(PlayerState.PAUSED)

    await waitFor(() => {
      const put = calls.calls.find((c) => c.method === 'PUT')
      expect(put?.url).toContain('/api/v1/videos/v1/progress')
      expect(put?.body).toEqual({ last_position_seconds: 1565 })
    })
    const section = within(screen.getByRole('region', { name: 'Playback progress' }))
    expect(await section.findByText(/50% · 26:05 of 52:10/)).toBeInTheDocument()
    expect(section.getByRole('progressbar', { name: 'Playback progress' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
  })

  it('says so when a save fails, without losing the position', async () => {
    api(THREE, { 'PUT /api/v1/videos/': { fail: true } })
    await openWorkspace('/learn/p1/v1')
    const player = await playerReady()

    player.setState(PlayerState.PLAYING)
    player.time = 100
    player.setState(PlayerState.PAUSED)
    expect(await screen.findByText(/Couldn't save your place/)).toBeInTheDocument()
  })

  it('shows the saved status as a labelled badge', async () => {
    api([pathVideo({ id: 'v1', position: 1, learning_status: 'NEEDS_REVISION' })])
    await openWorkspace('/learn/p1/v1')
    const section = within(screen.getByRole('region', { name: 'Playback progress' }))
    expect(section.getByText('Needs Revision')).toBeInTheDocument()
  })

  it('marks cached path data stale when leaving, so the path page shows the new position', async () => {
    api(THREE)
    const { unmount, client } = await openWorkspace('/learn/p1/v1')
    client.setQueryData(['learning-paths', 'detail', 'p1'], makePath({ id: 'p1' }))
    expect(client.getQueryState(['learning-paths', 'detail', 'p1'])?.isInvalidated).toBe(false)

    unmount()
    expect(client.getQueryState(['learning-paths', 'detail', 'p1'])?.isInvalidated).toBe(true)
  })
})

describe('problems', () => {
  it('says when the video is not in the path', async () => {
    api(THREE)
    renderApp({ route: '/learn/p1/nope' })
    expect(
      await screen.findByRole('heading', {
        name: "This video isn't in the learning path",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the learning path' })).toHaveAttribute(
      'href',
      '/learning-paths/p1',
    )
  })

  it('says when the learning path does not exist', async () => {
    api(THREE, {
      'GET /api/v1/learning-paths/p1/videos': {
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
    renderApp({ route: '/learn/p1/v1' })
    expect(
      await screen.findByRole('heading', { name: 'Learning path not found' }),
    ).toBeInTheDocument()
  })

  it('offers a retry when the server is unreachable', async () => {
    const user = userEvent.setup()
    let attempts = 0
    api(THREE, {
      'GET /api/v1/learning-paths/p1/videos': () =>
        ++attempts === 1
          ? { status: 500, body: {} }
          : { body: { total: 3, limit: 500, offset: 0, items: THREE } },
    })
    renderApp({ route: '/learn/p1/v1' })
    expect(
      await screen.findByRole('heading', { name: "Couldn't load this video" }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson 1' })).toBeInTheDocument()
  })
})

describe('standalone video (/learn/saved/:videoId)', () => {
  it('opens a saved video outside any path', async () => {
    const v = pathVideo({
      id: 'v1',
      position: 1,
      learning_status: 'IN_PROGRESS',
      last_position_seconds: 900,
    })
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': {
        body: { total: 0, limit: 100, offset: 0, items: [] },
      },
      'GET /api/v1/videos/v1': {
        body: {
          video: v.video,
          learning_status: v.learning_status,
          last_position_seconds: v.last_position_seconds,
          playback_pct: 28.8,
          ever_completed_at: null,
          last_watched_at: null,
        },
      },
    })
    renderApp({ route: '/learn/saved/v1' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lesson 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saved videos' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('region', { name: 'Resume playback' })).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Videos in this path' }),
    ).not.toBeInTheDocument()
  })

  it('shows not found for a video the user has no access to', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': {
        body: { total: 0, limit: 100, offset: 0, items: [] },
      },
      'GET /api/v1/videos/zzz': {
        status: 404,
        body: {
          error: { code: 'NOT_FOUND', message: 'Video not found', details: [] },
        },
      },
    })
    renderApp({ route: '/learn/saved/zzz' })
    expect(await screen.findByRole('heading', { name: 'Video not found' })).toBeInTheDocument()
  })
})
