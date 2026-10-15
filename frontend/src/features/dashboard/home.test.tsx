import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}

function pathsReply(items: ReturnType<typeof makePath>[]) {
  return { body: { total: items.length, limit: 100, offset: 0, items } }
}

describe('dashboard', () => {
  it('greets the user by name', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': pathsReply([]) })
    renderApp()
    expect(await screen.findByText(/Good (morning|afternoon|evening), Ada/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ready to learn today?' })).toBeInTheDocument()
  })

  it('shows a loading state, then the empty state for a new account', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': { ...pathsReply([]), delay: 50 },
    })
    renderApp()
    expect(
      await screen.findByRole('status', { name: 'Loading your dashboard' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Your learning workspace starts here.' }),
    ).toBeInTheDocument()
    // No invented statistics for an empty account.
    expect(screen.queryByText('Videos Completed')).not.toBeInTheDocument()
  })

  it('the empty state opens the create-path dialog', async () => {
    const user = userEvent.setup()
    mockApi({ ...ME, 'GET /api/v1/learning-paths': pathsReply([]) })
    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Create a learning path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
  })

  it('summarises real data and never fabricates the rest', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': pathsReply([
        makePath({ id: 'a', title: 'Algorithms', total_videos: 10, completed_videos: 4 }),
        makePath({
          id: 'b',
          title: 'Networks',
          total_videos: 5,
          completed_videos: 5,
          completion_pct: 100,
        }),
        makePath({
          id: 'c',
          title: 'Empty one',
          total_videos: 0,
          completed_videos: 0,
          completion_pct: 0,
        }),
      ]),
    })
    renderApp()

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    // Active = not fully completed: Algorithms and the empty path.
    expect(summary.getByText('Active Learning Paths').parentElement).toHaveTextContent('2')
    expect(summary.getByText('Active Learning Paths').parentElement).toHaveTextContent('3 in total')
    expect(summary.getByText('Videos Completed').parentElement).toHaveTextContent('9')
    expect(summary.getByText('Videos Completed').parentElement).toHaveTextContent(
      'out of 15 videos',
    )
    // Nothing watched today, and nothing in the revision queue.
    expect(summary.getByText('Learning Time').parentElement).toHaveTextContent('0 min')
    expect(summary.getByText('Learning Time').parentElement).toHaveTextContent('0 min this week')
    expect(summary.getByText('Needs Revision').parentElement).toHaveTextContent('0')
    expect(summary.getByText('Needs Revision').parentElement).toHaveTextContent('all caught up')
  })

  it('renders a card per path with an accessible progress bar', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': pathsReply([
        makePath({
          id: 'a',
          title: 'Algorithms',
          completed_videos: 4,
          total_videos: 10,
          completion_pct: 40,
          last_activity_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
        }),
        makePath({
          id: 'b',
          title: 'Fresh',
          completed_videos: 0,
          in_progress_videos: 0,
          completion_pct: 0,
        }),
      ]),
    })
    renderApp()

    const section = within(await screen.findByRole('region', { name: 'Your Learning Paths' }))
    const bar = section.getByRole('progressbar', { name: 'Algorithms progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(section.getByText('4 / 10 completed')).toBeInTheDocument()
    expect(section.getByText('Last watched 2 hours ago')).toBeInTheDocument()
    expect(section.getByRole('link', { name: 'Continue Algorithms' })).toHaveAttribute(
      'href',
      '/learning-paths/a',
    )
    // A path nobody has started offers "Open Path" rather than "Continue".
    expect(section.getByText('Not started yet')).toBeInTheDocument()
    expect(section.getByRole('link', { name: 'Open path Fresh' })).toBeInTheDocument()
  })

  it('shows a recoverable error and retries', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': () =>
        ++attempts === 1
          ? { status: 500, body: {} }
          : pathsReply([makePath({ title: 'Back again' })]),
    })
    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your learning paths")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await within(screen.getByRole('main')).findByText('Back again')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
