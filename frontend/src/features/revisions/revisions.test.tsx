import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RevisionItem, RevisionQueue, RevisionState } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'
import { RevisionControls } from './RevisionControls'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const URL = '/api/v1/videos/v1/revision'

function state(over: Partial<RevisionState> = {}): RevisionState {
  return {
    video_id: 'v1',
    learning_status: 'IN_PROGRESS',
    active: false,
    due_at: null,
    flagged_at: null,
    revised_at: null,
    due_state: null,
    today: '2026-10-15',
    ...over,
  }
}

const flagged = (over: Partial<RevisionState> = {}) =>
  state({
    learning_status: 'NEEDS_REVISION',
    active: true,
    due_at: '2026-10-16',
    flagged_at: '2026-10-15T10:00:00Z',
    due_state: 'upcoming',
    ...over,
  })

function renderControls(onStatus = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RevisionControls videoId="v1" title="Binary Search" onStatus={onStatus} />
    </QueryClientProvider>,
  )
  return onStatus
}

describe('flagging', () => {
  it('flags a video, then shows the due date and the new actions', async () => {
    const user = userEvent.setup()
    let current = state()
    const api = mockApi({
      [`GET ${URL}`]: () => ({ body: current }),
      [`PUT ${URL}`]: () => {
        current = flagged()
        return { body: current }
      },
    })
    const onStatus = renderControls()
    await user.click(await screen.findByRole('button', { name: 'Needs revision' }))

    expect(await screen.findByText('Needs revision · Due tomorrow')).toBeInTheDocument()
    expect(onStatus).toHaveBeenCalledWith('NEEDS_REVISION')
    const put = api.calls.find((c) => c.method === 'PUT')
    expect(put?.body).toEqual({ timezone: expect.any(String) }) // no date: the server picks tomorrow
  })

  it('shows an error and stays flaggable when flagging fails', async () => {
    const user = userEvent.setup()
    mockApi({ [`GET ${URL}`]: { body: state() }, [`PUT ${URL}`]: { fail: true } })
    renderControls()
    await user.click(await screen.findByRole('button', { name: 'Needs revision' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't update the revision/)
    expect(screen.getByRole('button', { name: 'Needs revision' })).toBeEnabled()
  })

  it.each([
    ['Due today', { due_at: '2026-10-15', due_state: 'due_today' as const }],
    ['Due Oct 20', { due_at: '2026-10-20' }],
    ['Overdue by 2 days', { due_at: '2026-10-13', due_state: 'overdue' as const }],
  ])('labels a revision as %s', async (label, over) => {
    mockApi({ [`GET ${URL}`]: { body: flagged(over) } })
    renderControls()
    expect(await screen.findByText(`Needs revision · ${label}`)).toBeInTheDocument()
  })
})

describe('rescheduling', () => {
  async function openDialog() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Reschedule' }))
    return { user, dialog: await screen.findByRole('dialog', { name: 'Reschedule revision' }) }
  }

  it('moves the due date with a quick choice', async () => {
    let current = flagged()
    const api = mockApi({
      [`GET ${URL}`]: () => ({ body: current }),
      [`PUT ${URL}`]: (init) => {
        current = flagged({ due_at: JSON.parse(String(init?.body)).due_at })
        return { body: current }
      },
    })
    renderControls()
    const { user, dialog } = await openDialog()
    expect(within(dialog).getByText(/Binary Search · currently due tomorrow/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'In 3 days' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Needs revision · Due Oct 18')).toBeInTheDocument()
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toMatchObject({ due_at: '2026-10-18' })
  })

  it('moves it to a chosen day', async () => {
    let current = flagged()
    mockApi({
      [`GET ${URL}`]: () => ({ body: current }),
      [`PUT ${URL}`]: (init) => {
        current = flagged({ due_at: JSON.parse(String(init?.body)).due_at })
        return { body: current }
      },
    })
    renderControls()
    const { user, dialog } = await openDialog()
    const field = within(dialog).getByLabelText('Or pick a day')
    expect(field).toHaveAttribute('min', '2026-10-15') // the past can't be picked
    await user.clear(field)
    await user.type(field, '2026-11-02')
    await user.click(within(dialog).getByRole('button', { name: 'Reschedule' }))
    expect(await screen.findByText('Needs revision · Due Nov 2')).toBeInTheDocument()
  })

  it('refuses a day in the past without calling the server', async () => {
    const api = mockApi({ [`GET ${URL}`]: { body: flagged() } })
    renderControls()
    const { user, dialog } = await openDialog()
    const field = within(dialog).getByLabelText('Or pick a day')
    await user.clear(field)
    await user.type(field, '2026-10-01')
    await user.click(within(dialog).getByRole('button', { name: 'Reschedule' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /can't be scheduled in the past/,
    )
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it("shows the server's explanation and stays open when it refuses", async () => {
    mockApi({
      [`GET ${URL}`]: { body: flagged() },
      [`PUT ${URL}`]: {
        status: 422,
        body: {
          error: { code: 'INVALID_DUE_DATE', message: "That's too far ahead.", details: [] },
        },
      },
    })
    renderControls()
    const { user, dialog } = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Next week' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That's too far ahead.")
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('marking revised', () => {
  it('removes it from the queue and passes the new status on', async () => {
    const user = userEvent.setup()
    let current = flagged()
    mockApi({
      [`GET ${URL}`]: () => ({ body: current }),
      [`POST ${URL}/complete`]: () => {
        current = state({ learning_status: 'COMPLETED', revised_at: '2026-10-15T12:00:00Z' })
        return { body: current }
      },
    })
    const onStatus = renderControls()
    await user.click(await screen.findByRole('button', { name: 'Mark revised' }))
    expect(await screen.findByRole('button', { name: 'Needs revision' })).toBeInTheDocument()
    expect(screen.queryByText(/Due tomorrow/)).not.toBeInTheDocument()
    expect(onStatus).toHaveBeenCalledWith('COMPLETED')
  })

  it('quietly refreshes when it was already revised in another tab', async () => {
    const user = userEvent.setup()
    let current = flagged()
    mockApi({
      [`GET ${URL}`]: () => ({ body: current }),
      [`POST ${URL}/complete`]: () => {
        current = state() // someone else already finished it
        return {
          status: 404,
          body: { error: { code: 'NO_ACTIVE_REVISION', message: 'Not in queue', details: [] } },
        }
      },
    })
    renderControls()
    await user.click(await screen.findByRole('button', { name: 'Mark revised' }))
    expect(await screen.findByRole('button', { name: 'Needs revision' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error when it fails, and the video stays queued', async () => {
    const user = userEvent.setup()
    mockApi({ [`GET ${URL}`]: { body: flagged() }, [`POST ${URL}/complete`]: { fail: true } })
    renderControls()
    await user.click(await screen.findByRole('button', { name: 'Mark revised' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't update the revision/)
    expect(screen.getByRole('button', { name: 'Mark revised' })).toBeEnabled()
  })
})

// --- Dashboard ---------------------------------------------------------------

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': {
    body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1' })] },
  },
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
    path: { id: 'p1', title: 'Algorithms' },
    due_at: '2026-10-16',
    flagged_at: '2026-10-15T10:00:00Z',
    due_state: 'upcoming',
    ...rest,
  }
}

function queue(items: RevisionItem[], dueCount = 0): { body: RevisionQueue } {
  return {
    body: { today: '2026-10-15', timezone: 'UTC', total: items.length, due_count: dueCount, items },
  }
}

describe('dashboard revisions', () => {
  it('lists the most urgent revisions, each opening its video', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/revisions': queue(
        [
          item({ id: 'v1', title: 'Binary Search', due_at: '2026-10-13', due_state: 'overdue' }),
          item({ id: 'v2', title: 'Scheduling', due_at: '2026-10-15', due_state: 'due_today' }),
          item({ id: 'v3', title: 'TCP', path: null }),
          item({ id: 'v4', title: 'Fourth is not shown' }),
        ],
        2,
      ),
    })
    renderApp()
    const heading = await screen.findByRole('heading', { name: 'Upcoming Revisions' })
    const panel = within(heading.closest('section') as HTMLElement)

    expect(await panel.findByRole('link', { name: /Binary Search/ })).toHaveAttribute(
      'href',
      '/learn/p1/v1',
    )
    expect(panel.getByText('Overdue by 2 days')).toBeInTheDocument()
    expect(panel.getByText('Due today')).toBeInTheDocument()
    expect(panel.getByRole('link', { name: /TCP/ })).toHaveAttribute('href', '/learn/saved/v3')
    expect(panel.getByText('Saved video')).toBeInTheDocument()
    expect(panel.queryByText('Fourth is not shown')).not.toBeInTheDocument()
    expect(panel.getByRole('link', { name: 'View all 4' })).toHaveAttribute('href', '/revision')
  })

  it('counts the queue in the summary', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/revisions': queue(
        [item({ id: 'v1', title: 'A' }), item({ id: 'v2', title: 'B' })],
        1,
      ),
    })
    renderApp()
    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    await waitFor(() =>
      expect(summary.getByText('Needs Revision').parentElement).toHaveTextContent('2'),
    )
    expect(summary.getByText('Needs Revision').parentElement).toHaveTextContent('1 due')
  })

  it('says everything is caught up when the queue is empty', async () => {
    mockApi({ ...ME })
    renderApp()
    const heading = await screen.findByRole('heading', { name: 'Upcoming Revisions' })
    expect(
      await within(heading.closest('section') as HTMLElement).findByText(/all caught up/),
    ).toBeInTheDocument()
  })

  it('offers a retry when the queue cannot be loaded', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      ...ME,
      'GET /api/v1/revisions': () => (++attempts <= 2 ? { status: 500 } : queue([])),
    })
    renderApp()
    const heading = await screen.findByRole('heading', { name: 'Upcoming Revisions' })
    const panel = within(heading.closest('section') as HTMLElement)
    expect(await panel.findByRole('alert')).toHaveTextContent(/Couldn't load your revisions/)
    await user.click(panel.getByRole('button', { name: 'Try again' }))
    expect(await panel.findByText(/all caught up/)).toBeInTheDocument()
  })
})
