import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authMock, fakeSession } from '@/test/supabaseMock'
import { mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

beforeEach(() => {
  mockApi({
    'GET /api/v1/me': {
      body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
    },
    'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
  })
})

describe('route protection', () => {
  it('sends a signed-out visitor who asks for a private page to the login page', async () => {
    renderApp({ route: '/library', signedIn: false })
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('shows a signed-out visitor the landing page at the root', async () => {
    renderApp({ route: '/', signedIn: false })
    expect(
      await screen.findByRole('heading', { level: 1, name: /learning you actually finish/i }),
    ).toBeInTheDocument()
  })

  it('returns the user to the page they wanted after signing in', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/goals', signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Daily Goals' })).toBeInTheDocument()
  })

  it('shows the app to a signed-in user', async () => {
    renderApp({ route: '/' })
    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
  })

  it('keeps a signed-in user away from the login page', async () => {
    renderApp({ route: '/login' })
    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
  })

  it('unknown URLs fall back to home', async () => {
    renderApp({ route: '/nope' })
    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
  })
})

describe('sign in', () => {
  it('signs in with a trimmed email and lands on the home page', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/login', signedIn: false })
    await user.type(await screen.findByLabelText('Email'), '  ada@example.test ')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(authMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ada@example.test',
      password: 'correct horse',
    })
    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
  })

  it('shows a friendly error and stays on the page when credentials are wrong', async () => {
    authMock.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as never)
    const user = userEvent.setup()
    renderApp({ route: '/login', signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('disables submit until both fields are filled', async () => {
    renderApp({ route: '/login', signedIn: false })
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})

describe('sign up', () => {
  it('rejects a short password without calling Supabase', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/signup', signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters')
    expect(authMock.auth.signUp).not.toHaveBeenCalled()
  })

  it('asks the user to confirm their email when no session is returned', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/signup', signedIn: false })
    await user.type(await screen.findByLabelText('Name (optional)'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'long enough pw')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('new@example.test')
    expect(authMock.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'long enough pw',
      options: { data: { display_name: 'Ada' } },
    })
  })

  it('goes straight home when Supabase returns a session (confirmation disabled)', async () => {
    authMock.auth.signUp.mockImplementationOnce(async () => {
      authMock.setSession(fakeSession('new@example.test'))
      return { data: { session: fakeSession('new@example.test'), user: {} }, error: null } as never
    })
    const user = userEvent.setup()
    renderApp({ route: '/signup', signedIn: false })
    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'long enough pw')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
  })
})

describe('sign out', () => {
  it('returns to the public landing page', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/' })
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(authMock.auth.signOut).toHaveBeenCalled())
    expect(
      await screen.findByRole('heading', { level: 1, name: /learning you actually finish/i }),
    ).toBeInTheDocument()
  })
})

describe('cached data belongs to one user', () => {
  it('is cleared when the user signs out', async () => {
    const client = new QueryClient()
    renderApp({ route: '/', client })
    await screen.findByRole('heading', { name: /Ready to learn today/ })
    client.setQueryData(['learning-paths', 'private'], 'alice-only')

    authMock.setSession(null) // sign out
    await waitFor(() => expect(client.getQueryData(['learning-paths', 'private'])).toBeUndefined())
  })

  it('is cleared when a different user signs in', async () => {
    const client = new QueryClient()
    renderApp({ route: '/', client })
    await screen.findByRole('heading', { name: /Ready to learn today/ })
    client.setQueryData(['me'], 'alice')

    authMock.setSession(fakeSession('bob@example.test', 'user-2'))
    await waitFor(() => expect(client.getQueryData(['me'])).toBeUndefined())
  })
})
