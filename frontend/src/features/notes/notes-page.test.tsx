import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { NoteListItem } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': {
    body: {
      total: 2,
      limit: 100,
      offset: 0,
      items: [
        makePath({ id: 'p1', title: 'Algorithms' }),
        makePath({ id: 'p2', title: 'Networks' }),
      ],
    },
  },
}

function note(over: Partial<NoteListItem> & { id: string; title: string }): NoteListItem {
  const { id, title, ...rest } = over
  return {
    video_id: id,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title: `Video ${id}`,
      channel_title: null,
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    path: { id: 'p1', title: 'Algorithms' },
    title,
    snippet: 'Cut the range in half each step.',
    updated_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    revision: 2,
    ...rest,
  }
}

const page = (items: NoteListItem[], total = items.length) => ({
  body: { total, limit: 100, offset: 0, items },
})

describe('My Notes page', () => {
  it('lists notes with their first line, text, video, path and last edit', async () => {
    mockApi({ ...ME, 'GET /api/v1/notes': page([note({ id: 'v1', title: 'Halving' })]) })
    renderApp({ route: '/notes' })

    expect(await screen.findByRole('heading', { name: 'My Notes' })).toBeInTheDocument()
    const item = within(
      await screen
        .findByRole('heading', { name: 'Halving' })
        .then((h) => h.closest('li') as HTMLElement),
    )
    expect(item.getByText('Cut the range in half each step.')).toBeInTheDocument()
    expect(item.getByText(/Video v1 · Algorithms · Edited 3 hours ago/)).toBeInTheDocument()
    expect(item.getByRole('link', { name: 'Open video Video v1' })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    expect(screen.getByText('1 note')).toBeInTheDocument()
  })

  it('opens a video that is in no path as a saved video, and flags an unavailable one', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/notes': page([
        note({
          id: 'v2',
          title: 'Orphan',
          path: null,
          video: {
            id: 'v2',
            youtube_video_id: 'ytv2xxxxxxx',
            title: 'Gone video',
            channel_title: null,
            thumbnail_url: null,
            duration_seconds: null,
            availability_state: 'unavailable',
          },
        }),
      ]),
    })
    renderApp({ route: '/notes' })
    expect(await screen.findByRole('link', { name: 'Open video Gone video' })).toHaveAttribute(
      'href',
      '/learn/saved/v2',
    )
    expect(screen.getByText(/Not in a path/)).toBeInTheDocument()
    expect(screen.getByText(/Video unavailable/)).toBeInTheDocument()
  })

  it('searches the note text after the student stops typing', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      ...ME,
      'GET /api/v1/notes': (_init, url) =>
        url.includes('q=merge')
          ? page([note({ id: 'v3', title: 'Merge sort' })])
          : page([note({ id: 'v1', title: 'Halving' })]),
    })
    renderApp({ route: '/notes' })
    await screen.findByText('Halving')

    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'merge')
    expect(await screen.findByText('Merge sort')).toBeInTheDocument()
    expect(screen.queryByText('Halving')).not.toBeInTheDocument()
    // One request for the finished word, not one per keystroke.
    const searches = api.calls.filter((c) => c.url.includes('q='))
    expect(searches).toHaveLength(1)
    expect(searches[0].url).toContain('q=merge')
  })

  it('filters by path', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      ...ME,
      'GET /api/v1/notes': (_init, url) =>
        url.includes('path_id=p2')
          ? page([note({ id: 'v4', title: 'TCP basics', path: { id: 'p2', title: 'Networks' } })])
          : page([note({ id: 'v1', title: 'Halving' })]),
    })
    renderApp({ route: '/notes' })
    await screen.findByText('Halving')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Path' }), 'p2')
    expect(await screen.findByText('TCP basics')).toBeInTheDocument()
    expect(api.calls.some((c) => c.url.includes('path_id=p2'))).toBe(true)
  })

  it('says when nothing matches, and clears the filters', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/notes': (_init, url) =>
        url.includes('q=zzz') ? page([]) : page([note({ id: 'v1', title: 'Halving' })]),
    })
    renderApp({ route: '/notes' })
    await screen.findByText('Halving')
    await user.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'zzz')
    expect(await screen.findByText('No notes match.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Halving')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toHaveValue('')
  })

  it('explains how to write a first note', async () => {
    mockApi({ ...ME })
    renderApp({ route: '/notes' })
    expect(await screen.findByText("You haven't written any notes yet.")).toBeInTheDocument()
  })

  it('says when only the most recent notes are shown', async () => {
    mockApi({ ...ME, 'GET /api/v1/notes': page([note({ id: 'v1', title: 'Halving' })], 250) })
    renderApp({ route: '/notes' })
    expect(
      await screen.findByText(/250 notes · showing the 1 most recently edited/),
    ).toBeInTheDocument()
  })

  it('offers a retry when notes cannot be loaded', async () => {
    const user = userEvent.setup()
    let failing = true
    mockApi({
      ...ME,
      'GET /api/v1/notes': () =>
        failing ? { status: 500 } : page([note({ id: 'v1', title: 'Halving' })]),
    })
    renderApp({ route: '/notes' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your notes/)
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Halving')).toBeInTheDocument())
  })
})
