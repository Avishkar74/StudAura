import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}

const PATH = makePath({
  id: 'p1',
  title: 'Data Structures',
  description: 'The classics',
  target_date: '2026-11-30',
  total_videos: 3,
})

function list(items: ReturnType<typeof makePath>[]) {
  return { body: { total: items.length, limit: 100, offset: 0, items } }
}

function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    ...ME,
    'GET /api/v1/learning-paths': list([PATH]),
    'GET /api/v1/learning-paths/p1': { body: PATH },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: 0, limit: 500, offset: 0, items: [] },
    },
    ...extra,
  })
}

describe('a path page', () => {
  it('shows the target date as written, not shifted by the time zone', async () => {
    setup()
    renderApp({ route: '/learning-paths/p1' })
    expect(await screen.findByText(/Target: Nov 30, 2026/)).toBeInTheDocument()
  })

  it('edits the title, description and target date', async () => {
    const user = userEvent.setup()
    let current = PATH
    const api = setup({
      'GET /api/v1/learning-paths/p1': () => ({ body: current }),
      'PATCH /api/v1/learning-paths/p1': (init) => {
        current = { ...current, ...JSON.parse(String(init?.body)) }
        return { body: current }
      },
    })
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Edit path' }))

    const dialog = screen.getByRole('dialog', { name: 'Edit learning path' })
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Data Structures')
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue('The classics')
    expect(within(dialog).getByLabelText(/Target date/)).toHaveValue('2026-11-30')

    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Algorithms')
    await user.clear(within(dialog).getByLabelText(/Target date/))
    await user.type(within(dialog).getByLabelText(/Target date/), '2026-12-15')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Algorithms' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved changes to “Algorithms”')
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      title: 'Algorithms',
      description: 'The classics',
      target_date: '2026-12-15',
    })
    expect(screen.getByText(/Target: Dec 15, 2026/)).toBeInTheDocument()
  })

  it('clears the target date and the description', async () => {
    const user = userEvent.setup()
    const api = setup({
      'PATCH /api/v1/learning-paths/p1': {
        body: { ...PATH, description: null, target_date: null },
      },
    })
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Edit path' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit learning path' })
    await user.click(within(dialog).getByRole('button', { name: 'Clear target date' }))
    await user.clear(within(dialog).getByLabelText(/Description/))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      title: 'Data Structures',
      description: null,
      target_date: null,
    })
  })

  it('will not save without a title', async () => {
    const user = userEvent.setup()
    setup()
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Edit path' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit learning path' })
    await user.clear(within(dialog).getByLabelText('Title'))
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('says so when saving fails, and keeps the dialog open', async () => {
    const user = userEvent.setup()
    setup({ 'PATCH /api/v1/learning-paths/p1': { status: 500, body: {} } })
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Edit path' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save your changes/)
    expect(screen.getByRole('dialog', { name: 'Edit learning path' })).toBeInTheDocument()
  })

  it('asks before deleting, and cancelling deletes nothing', async () => {
    const user = userEvent.setup()
    const api = setup()
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Delete path' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete learning path?' })
    expect(dialog).toHaveTextContent(
      'Your notes, comments, watch progress and saved videos are kept',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('deletes the path, confirms it and returns to the list', async () => {
    const user = userEvent.setup()
    let remaining = [PATH]
    const api = setup({
      'GET /api/v1/learning-paths': () => list(remaining),
      'DELETE /api/v1/learning-paths/p1': () => {
        remaining = []
        return { status: 204 }
      },
    })
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Delete path' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete learning path?' })).getByRole('button', {
        name: 'Delete path',
      }),
    )

    expect(
      await screen.findByRole('heading', { level: 1, name: 'All Learning Paths' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Deleted learning path “Data Structures”')
    expect(api.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/p1'))).toBe(true)
    expect(screen.queryByRole('link', { name: 'Data Structures' })).not.toBeInTheDocument()
  })

  it('keeps the dialog open with an error when the delete fails', async () => {
    const user = userEvent.setup()
    setup({ 'DELETE /api/v1/learning-paths/p1': { status: 500, body: {} } })
    renderApp({ route: '/learning-paths/p1' })
    await user.click(await screen.findByRole('button', { name: 'Delete path' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete learning path?' })).getByRole('button', {
        name: 'Delete path',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not delete/)
    expect(screen.getByRole('dialog', { name: 'Delete learning path?' })).toBeInTheDocument()
  })
})

describe('the All Learning Paths page', () => {
  it('lets you edit or delete a path from its card', async () => {
    const user = userEvent.setup()
    setup()
    renderApp({ route: '/learning-paths' })
    await user.click(await screen.findByRole('button', { name: 'Edit Data Structures' }))
    expect(screen.getByRole('dialog', { name: 'Edit learning path' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Delete Data Structures' }))
    expect(screen.getByRole('dialog', { name: 'Delete learning path?' })).toBeInTheDocument()
  })

  it('shows a renamed path in the sidebar and on its card straight away', async () => {
    const user = userEvent.setup()
    let current = PATH
    setup({
      'GET /api/v1/learning-paths': () => list([current]),
      'PATCH /api/v1/learning-paths/p1': (init) => {
        current = { ...current, ...JSON.parse(String(init?.body)) }
        return { body: current }
      },
    })
    renderApp({ route: '/learning-paths' })
    await user.click(await screen.findByRole('button', { name: 'Edit Data Structures' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit learning path' })
    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Renamed')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    const sidebar = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(await sidebar.findByRole('link', { name: 'Renamed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Renamed' })).toBeInTheDocument()
  })
})

describe('creating a path', () => {
  it('shows it in the sidebar at once and confirms it', async () => {
    const user = userEvent.setup()
    const created = makePath({ id: 'new-1', title: 'Operating Systems' })
    let release: () => void = () => undefined
    const slow = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    mockApi({
      ...ME,
      // The first read is the page load. Later reads are the background refresh, which is slow
      // (the server is far away): the sidebar must not wait for it.
      'GET /api/v1/learning-paths': () => {
        reads += 1
        return reads === 1 ? list([PATH]) : { ...list([created, PATH]), gate: slow }
      },
      'POST /api/v1/learning-paths': { status: 201, body: created },
      'GET /api/v1/learning-paths/new-1': { body: created },
      'GET /api/v1/learning-paths/new-1/videos': {
        body: { total: 0, limit: 500, offset: 0, items: [] },
      },
    })
    renderApp({ route: '/learning-paths' })
    await user.click(await screen.findByRole('button', { name: 'Create learning path' }))
    await user.type(screen.getByLabelText('Title'), 'Operating Systems')
    await user.click(screen.getByRole('button', { name: 'Create path' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Operating Systems' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Created learning path “Operating Systems”',
    )
    const sidebar = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(sidebar.getByRole('link', { name: 'Operating Systems' })).toBeInTheDocument()
    release()
  })
})
