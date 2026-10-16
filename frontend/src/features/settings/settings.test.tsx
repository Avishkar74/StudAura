import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { authMock } from '@/test/supabaseMock'
import { mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  id: 'user-1',
  email: 'ada@example.test',
  display_name: 'Ada',
  created_at: '2026-03-04T10:00:00Z',
}

function setup(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/v1/me': { body: ME },
    'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
    ...extra,
  })
}

function sectionOf(heading: HTMLElement) {
  return within(heading.closest('section') as HTMLElement)
}

describe('settings', () => {
  it('is a real page with the profile, goal and account sections', async () => {
    setup()
    renderApp({ route: '/settings' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByText(/still being built/i)).not.toBeInTheDocument()
    for (const name of ['Profile', 'Daily goal', 'Account']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('shows the account details', async () => {
    setup()
    renderApp({ route: '/settings' })
    const account = sectionOf(await screen.findByRole('heading', { name: 'Account' }))
    expect(account.getByText('ada@example.test')).toBeInTheDocument()
    expect(await account.findByText('Mar 4, 2026')).toBeInTheDocument()
    expect(account.getByText('Time zone')).toBeInTheDocument()
  })

  it('starts with the current name and only lets you save a change', async () => {
    const user = userEvent.setup()
    setup()
    renderApp({ route: '/settings' })
    const name = await screen.findByLabelText('Display name')
    expect(name).toHaveValue('Ada')
    const save = screen.getByRole('button', { name: 'Save profile' })
    expect(save).toBeDisabled()
    await user.type(name, ' Lovelace')
    expect(save).toBeEnabled()
  })

  it('saves the display name, confirms it and updates the header menu', async () => {
    const user = userEvent.setup()
    let current = ME
    const api = setup({
      'GET /api/v1/me': () => ({ body: current }),
      'PATCH /api/v1/me': (init) => {
        current = { ...current, ...JSON.parse(String(init?.body)) }
        return { body: current }
      },
    })
    renderApp({ route: '/settings' })
    const name = await screen.findByLabelText('Display name')
    await user.clear(name)
    await user.type(name, '  Grace Hopper  ')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Profile saved')
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      display_name: 'Grace Hopper',
    })
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(within(screen.getByRole('menu')).getByText('Grace Hopper')).toBeInTheDocument()
  })

  it('clears the name when the box is emptied', async () => {
    const user = userEvent.setup()
    const api = setup({ 'PATCH /api/v1/me': { body: { ...ME, display_name: null } } })
    renderApp({ route: '/settings' })
    await user.clear(await screen.findByLabelText('Display name'))
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ display_name: null })
  })

  it('says so when saving fails and keeps what was typed', async () => {
    const user = userEvent.setup()
    setup({ 'PATCH /api/v1/me': { status: 500, body: {} } })
    renderApp({ route: '/settings' })
    const name = await screen.findByLabelText('Display name')
    await user.type(name, 'x')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save your profile/)
    expect(name).toHaveValue('Adax')
  })

  it('lets you set the daily goal from here', async () => {
    setup()
    renderApp({ route: '/settings' })
    const goal = sectionOf(await screen.findByRole('heading', { name: 'Daily goal' }))
    expect(await goal.findByRole('button', { name: 'Set a daily goal' })).toBeInTheDocument()
  })

  it('signs out', async () => {
    const user = userEvent.setup()
    setup()
    renderApp({ route: '/settings' })
    const account = sectionOf(await screen.findByRole('heading', { name: 'Account' }))
    await user.click(account.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(authMock.auth.signOut).toHaveBeenCalled())
  })
})
