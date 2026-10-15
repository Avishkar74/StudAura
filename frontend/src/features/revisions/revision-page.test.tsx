import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RevisionItem, RevisionQueue, RevisionState } from '@/api/types'
import { mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
}

function item(over: Partial<RevisionItem> & { id: string; title: string }): RevisionItem {
  const { id, title, ...rest } = over
  return {
    video_id: id,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title,
      channel_title: null,
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    path: { id: 'p1', title: 'DSA' },
    due_at: '2026-10-16',
    flagged_at: '2026-10-15T10:00:00Z',
    due_state: 'upcoming',
    ...rest,
  }
}

const queue = (items: RevisionItem[]): { body: RevisionQueue } => ({
  body: {
    today: '2026-10-15',
    timezone: 'UTC',
    total: items.length,
    due_count: items.filter((i) => i.due_state !== 'upcoming').length,
    items,
  },
})

const MIXED = [
  item({ id: 'v1', title: 'Hash Tables', due_at: '2026-10-12', due_state: 'overdue' }),
  item({ id: 'v2', title: 'Binary Search', due_at: '2026-10-15', due_state: 'due_today' }),
  item({
    id: 'v3',
    title: 'Process Scheduling',
    due_at: '2026-10-15',
    due_state: 'due_today',
    flagged_at: '2026-10-15T11:00:00Z',
  }),
  item({ id: 'v4', title: 'TCP Congestion', path: null }),
]

const group = async (name: RegExp) =>
  within((await screen.findByRole('heading', { name })).closest('section') as HTMLElement)

describe('Needs Revision page', () => {
  it('groups the queue into overdue, due today and upcoming', async () => {
    mockApi({ ...ME, 'GET /api/v1/revisions': queue(MIXED) })
    renderApp({ route: '/revision' })

    expect(await screen.findByRole('heading', { name: 'Needs Revision' })).toBeInTheDocument()
    const overdue = await group(/^Overdue/)
    expect(overdue.getByText('Hash Tables')).toBeInTheDocument()
    expect(overdue.getByText('Overdue by 3 days')).toBeInTheDocument()
    const today = await group(/^Due today/)
    expect(today.getByText('Binary Search')).toBeInTheDocument()
    expect(today.getByText('Process Scheduling')).toBeInTheDocument()
    const upcoming = await group(/^Upcoming/)
    expect(upcoming.getByText('Due tomorrow')).toBeInTheDocument()
    expect(upcoming.getByText('Saved video')).toBeInTheDocument()
    expect(
      (await group(/^Due today/)).getByRole('heading', { name: /Due today/ }),
    ).toHaveTextContent('Due today (2)')
  })

  it('opens each video in the workspace with Review now', async () => {
    mockApi({ ...ME, 'GET /api/v1/revisions': queue(MIXED) })
    renderApp({ route: '/revision' })
    const overdue = await group(/^Overdue/)
    expect(overdue.getByRole('link', { name: 'Review Hash Tables now' })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    const upcoming = await group(/^Upcoming/)
    expect(upcoming.getByRole('link', { name: 'Review TCP Congestion now' })).toHaveAttribute(
      'href',
      '/learn/saved/v4',
    )
  })

  it('sorts within each group', async () => {
    const user = userEvent.setup()
    mockApi({ ...ME, 'GET /api/v1/revisions': queue(MIXED) })
    renderApp({ route: '/revision' })
    const titles = async () =>
      (await group(/^Due today/)).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(await titles()).toEqual(['Binary Search', 'Process Scheduling'])

    await user.selectOptions(screen.getByLabelText('Sort by'), 'flagged')
    expect(await titles()).toEqual(['Process Scheduling', 'Binary Search']) // newest flag first
    await user.selectOptions(screen.getByLabelText('Sort by'), 'title')
    expect(await titles()).toEqual(['Binary Search', 'Process Scheduling'])
  })

  it('marks a video revised and drops it from the list', async () => {
    const user = userEvent.setup()
    let items = MIXED
    mockApi({
      ...ME,
      'GET /api/v1/revisions': () => queue(items),
      'POST /api/v1/videos/v1/revision/complete': () => {
        items = items.filter((i) => i.video_id !== 'v1')
        return {
          body: {
            video_id: 'v1',
            learning_status: 'COMPLETED',
            active: false,
            due_at: null,
            flagged_at: null,
            revised_at: '2026-10-15T12:00:00Z',
            due_state: null,
            today: '2026-10-15',
          } satisfies RevisionState,
        }
      },
    })
    renderApp({ route: '/revision' })
    await user.click(await screen.findByRole('button', { name: 'Mark Hash Tables revised' }))
    await waitFor(() => expect(screen.queryByText('Hash Tables')).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /^Overdue/ })).not.toBeInTheDocument()
  })

  it('refreshes quietly when it was already revised elsewhere', async () => {
    const user = userEvent.setup()
    let items = MIXED
    mockApi({
      ...ME,
      'GET /api/v1/revisions': () => queue(items),
      'POST /api/v1/videos/v1/revision/complete': () => {
        items = items.filter((i) => i.video_id !== 'v1')
        return {
          status: 404,
          body: { error: { code: 'NO_ACTIVE_REVISION', message: 'gone', details: [] } },
        }
      },
    })
    renderApp({ route: '/revision' })
    await user.click(await screen.findByRole('button', { name: 'Mark Hash Tables revised' }))
    await waitFor(() => expect(screen.queryByText('Hash Tables')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error and keeps the row when marking revised fails', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/revisions': queue(MIXED),
      'POST /api/v1/videos/v1/revision/complete': { fail: true },
    })
    renderApp({ route: '/revision' })
    await user.click(await screen.findByRole('button', { name: 'Mark Hash Tables revised' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't mark that revised/)
    expect(screen.getByText('Hash Tables')).toBeInTheDocument()
  })

  it('reschedules from the list', async () => {
    const user = userEvent.setup()
    let items = MIXED
    const api = mockApi({
      ...ME,
      'GET /api/v1/revisions': () => queue(items),
      'PUT /api/v1/videos/v1/revision': (init) => {
        const due = JSON.parse(String(init?.body)).due_at as string
        items = items.map((i) =>
          i.video_id === 'v1' ? { ...i, due_at: due, due_state: 'upcoming' as const } : i,
        )
        return { body: {} }
      },
    })
    renderApp({ route: '/revision' })
    await user.click(await screen.findByRole('button', { name: 'Reschedule Hash Tables' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reschedule revision' })
    await user.click(within(dialog).getByRole('button', { name: 'In 3 days' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ due_at: '2026-10-18' })
    // It left the overdue group.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /^Overdue/ })).not.toBeInTheDocument(),
    )
    expect((await group(/^Upcoming/)).getByText('Hash Tables')).toBeInTheDocument()
  })

  it('says everything is caught up when the queue is empty', async () => {
    mockApi({ ...ME })
    renderApp({ route: '/revision' })
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Overdue/ })).not.toBeInTheDocument()
  })

  it('offers a retry when the queue cannot be loaded', async () => {
    const user = userEvent.setup()
    let failing = true
    mockApi({
      ...ME,
      'GET /api/v1/revisions': () => (failing ? { status: 500 } : queue(MIXED)),
    })
    renderApp({ route: '/revision' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your revisions/)
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Hash Tables')).toBeInTheDocument()
  })
})
