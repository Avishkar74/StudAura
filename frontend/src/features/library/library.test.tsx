import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SavedItem, SavedState } from '@/api/types'
import { mockApi, renderApp } from '@/test/renderApp'
import { SaveToggle } from './SaveToggle'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
}

function item(over: Partial<SavedItem> & { id: string; title: string }): SavedItem {
  const { id, title, ...rest } = over
  return {
    video_id: id,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title,
      channel_title: 'Example Academy',
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    path: { id: 'p1', title: 'Algorithms' },
    learning_status: 'IN_PROGRESS',
    last_position_seconds: 300,
    playback_pct: 50,
    last_watched_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    saved_at: new Date(Date.now() - 86400e3).toISOString(),
    ...rest,
  }
}

const page = (items: SavedItem[]) => ({
  body: { total: items.length, limit: 100, offset: 0, items },
})

describe('Saved Videos page', () => {
  it('lists bookmarks with status, progress, path and activity', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': page([item({ id: 'v1', title: 'Binary Search' })]),
    })
    renderApp({ route: '/library' })

    expect(await screen.findByRole('heading', { name: 'Saved Videos' })).toBeInTheDocument()
    const row = within(
      (await screen.findByRole('heading', { name: 'Binary Search' })).closest('li') as HTMLElement,
    )
    expect(row.getByText('In Progress')).toBeInTheDocument()
    expect(row.getByText(/Algorithms · Example Academy/)).toBeInTheDocument()
    expect(row.getByText(/Watched 2 hours ago · Saved yesterday/)).toBeInTheDocument()
    expect(row.getByRole('progressbar', { name: 'Binary Search playback' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    )
    expect(row.getByRole('link', { name: 'Open Binary Search' })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    expect(screen.getByText('1 saved video')).toBeInTheDocument()
  })

  it('opens a saved video that is in no path from the saved route', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': page([
        item({
          id: 'v2',
          title: 'Loose',
          path: null,
          learning_status: 'NOT_STARTED',
          last_watched_at: null,
          playback_pct: 0,
        }),
      ]),
    })
    renderApp({ route: '/library' })
    expect(await screen.findByRole('link', { name: 'Open Loose' })).toHaveAttribute(
      'href',
      '/learn/saved/v2',
    )
    expect(screen.getByText(/Not in a path/)).toBeInTheDocument()
    expect(screen.getByText(/Not watched yet/)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('filters by learning status and sorts', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      ...ME,
      'GET /api/v1/saved-videos': page([item({ id: 'v1', title: 'A' })]),
    })
    renderApp({ route: '/library' })
    await screen.findByText('A')
    const filters = within(screen.getByRole('group', { name: 'Filter by status' }))
    expect(filters.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(filters.getByRole('button', { name: 'Needs Revision' }))
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.includes('status=NEEDS_REVISION'))).toBe(true),
    )
    expect(filters.getByRole('button', { name: 'Needs Revision' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.selectOptions(screen.getByLabelText('Sort by'), 'watched')
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) => c.url.includes('sort=watched') && c.url.includes('status=NEEDS_REVISION'),
        ),
      ).toBe(true),
    )
  })

  it('says why a filter is empty, and explains how to save a first video', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': (_init, url) =>
        url.includes('status=COMPLETED') ? page([]) : page([]),
    })
    renderApp({ route: '/library' })
    expect(await screen.findByText('Nothing saved yet.')).toBeInTheDocument()
    expect(screen.getByText(/Save videos you want to return to/)).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', {
        name: 'Completed',
      }),
    )
    expect(await screen.findByText('No saved videos are completed.')).toBeInTheDocument()
  })

  it('removes a bookmark and the row goes away', async () => {
    const user = userEvent.setup()
    let items = [item({ id: 'v1', title: 'Binary Search' }), item({ id: 'v2', title: 'Sorting' })]
    const api = mockApi({
      ...ME,
      'GET /api/v1/saved-videos': () => page(items),
      'DELETE /api/v1/videos/v1/saved': () => {
        items = items.filter((i) => i.video_id !== 'v1')
        return { status: 204 }
      },
    })
    renderApp({ route: '/library' })
    await user.click(
      await screen.findByRole('button', { name: 'Remove Binary Search from saved videos' }),
    )
    await waitFor(() => expect(screen.queryByText('Binary Search')).not.toBeInTheDocument())
    expect(screen.getByText('Sorting')).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(true)
  })

  it('keeps the row and says so when removing fails', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': page([item({ id: 'v1', title: 'Binary Search' })]),
      'DELETE /api/v1/videos/v1/saved': { fail: true },
    })
    renderApp({ route: '/library' })
    await user.click(await screen.findByRole('button', { name: /Remove Binary Search/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't remove that bookmark/)
    expect(screen.getByText('Binary Search')).toBeInTheDocument()
  })

  it('flags a video that cannot be played here', async () => {
    const base = item({ id: 'v1', title: 'Blocked' })
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': page([
        { ...base, video: { ...base.video, availability_state: 'embed_disabled' } },
      ]),
    })
    renderApp({ route: '/library' })
    expect(await screen.findByText(/Can't be played here/)).toBeInTheDocument()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    const user = userEvent.setup()
    let failing = true
    mockApi({
      ...ME,
      'GET /api/v1/saved-videos': () =>
        failing ? { status: 500 } : page([item({ id: 'v1', title: 'Binary Search' })]),
    })
    renderApp({ route: '/library' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your saved videos/)
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Binary Search')).toBeInTheDocument()
  })
})

describe('the Save button on a video', () => {
  function renderToggle() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SaveToggle videoId="v1" />
      </QueryClientProvider>,
    )
  }
  const state = (saved: boolean): SavedState => ({
    video_id: 'v1',
    saved,
    saved_at: saved ? '2026-10-15T10:00:00Z' : null,
  })

  it('saves and unsaves', async () => {
    const user = userEvent.setup()
    let saved = false
    const api = mockApi({
      'GET /api/v1/videos/v1/saved': () => ({ body: state(saved) }),
      'PUT /api/v1/videos/v1/saved': () => {
        saved = true
        return { body: state(true) }
      },
      'DELETE /api/v1/videos/v1/saved': () => {
        saved = false
        return { status: 204 }
      },
    })
    renderToggle()
    const button = await screen.findByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)
    const savedButton = await screen.findByRole('button', { name: 'Saved' })
    expect(savedButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(savedButton)
    expect(await screen.findByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(api.calls.filter((c) => c.method !== 'GET').map((c) => c.method)).toEqual([
      'PUT',
      'DELETE',
    ])
  })

  it('shows an error and keeps the state when it fails', async () => {
    const user = userEvent.setup()
    mockApi({
      'GET /api/v1/videos/v1/saved': { body: state(false) },
      'PUT /api/v1/videos/v1/saved': { fail: true },
    })
    renderToggle()
    await user.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't update your saved videos/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('starts as Saved when the video already is', async () => {
    mockApi({ 'GET /api/v1/videos/v1/saved': { body: state(true) } })
    renderToggle()
    expect(await screen.findByRole('button', { name: 'Saved' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
