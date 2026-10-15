import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}

const page = (items: ReturnType<typeof makePath>[]) => ({
  body: { total: items.length, limit: 100, offset: 0, items },
})

const PATHS = [
  makePath({
    id: 'a',
    title: 'Algorithms',
    description: 'Sorting, searching and graphs.',
    target_date: '2026-12-01',
    total_videos: 10,
    completed_videos: 4,
    completion_pct: 40,
  }),
  makePath({
    id: 'b',
    title: 'Networks',
    total_videos: 5,
    completed_videos: 5,
    completion_pct: 100,
  }),
]

describe('All Learning Paths', () => {
  it('lists every path with its description, target date and progress', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': page(PATHS) })
    renderApp({ route: '/learning-paths' })

    expect(await screen.findByRole('heading', { name: 'All Learning Paths' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    expect(await main.findByText('Algorithms')).toBeInTheDocument()
    expect(main.getByText('Sorting, searching and graphs.')).toBeInTheDocument()
    expect(main.getByText(/Target Dec 1, 2026/)).toBeInTheDocument()
    expect(main.getByRole('progressbar', { name: 'Algorithms progress' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(main.getByText('2 paths')).toBeInTheDocument()
  })

  it('sorts by the chosen order and remembers it in the address', async () => {
    const user = userEvent.setup()
    const api = mockApi({ ...ME, 'GET /api/v1/learning-paths': page(PATHS) })
    renderApp({ route: '/learning-paths' })
    await screen.findByText('Algorithms')

    await user.selectOptions(screen.getByLabelText('Sort by'), 'target_date')
    await waitFor(() =>
      expect(api.calls.some((c) => c.url.includes('/learning-paths?sort=target_date'))).toBe(true),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/learning-paths?sort=target_date')
  })

  it('starts from the sort in the address', async () => {
    const api = mockApi({ ...ME, 'GET /api/v1/learning-paths': page(PATHS) })
    renderApp({ route: '/learning-paths?sort=name' })
    await screen.findByText('Algorithms')
    expect(screen.getByLabelText('Sort by')).toHaveValue('name')
    expect(api.calls.some((c) => c.url.includes('sort=name'))).toBe(true)
  })

  it('ignores an unknown sort', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': page(PATHS) })
    renderApp({ route: '/learning-paths?sort=bogus' })
    await screen.findByText('Algorithms')
    expect(screen.getByLabelText('Sort by')).toHaveValue('recent')
  })

  it('filters by the search from the header, with a way to clear it', async () => {
    const user = userEvent.setup()
    const api = mockApi({ ...ME, 'GET /api/v1/learning-paths': page([PATHS[0]]) })
    renderApp({ route: '/learning-paths?q=algo' })

    expect(await screen.findByText(/Results for/)).toHaveTextContent('Results for “algo”')
    await waitFor(() => expect(api.calls.some((c) => c.url.includes('q=algo'))).toBe(true))
    await user.click(screen.getByRole('link', { name: 'Clear search' }))
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/learning-paths$/)
  })

  it('says when nothing matches the search', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': page([]) })
    renderApp({ route: '/learning-paths?q=zzz' })
    expect(await screen.findByText(/No paths match/)).toBeInTheDocument()
  })

  it('explains what a path is when there are none, and offers to create one', async () => {
    const user = userEvent.setup()
    mockApi({ ...ME, 'GET /api/v1/learning-paths': page([]) })
    renderApp({ route: '/learning-paths' })
    expect(await screen.findByText("You don't have a learning path yet.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create a learning path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
  })

  it('opens the create, add video and import dialogs', async () => {
    const user = userEvent.setup()
    mockApi({ ...ME, 'GET /api/v1/learning-paths': page(PATHS) })
    renderApp({ route: '/learning-paths' })
    await screen.findByText('Algorithms')
    const main = within(screen.getByRole('main'))

    await user.click(main.getByRole('button', { name: 'Create Learning Path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(main.getByRole('button', { name: 'Add Video' }))
    expect(await screen.findByRole('dialog', { name: 'Add YouTube video' })).toBeInTheDocument()
  })

  it('offers a retry when the paths cannot be loaded', async () => {
    const user = userEvent.setup()
    let failing = true
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': () => (failing ? { status: 500 } : page(PATHS)),
    })
    renderApp({ route: '/learning-paths' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load your learning paths/)
    failing = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Algorithms')).toBeInTheDocument()
  })
})
