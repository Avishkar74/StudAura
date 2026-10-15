import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { createAuthMock, fakeSession } from '@/test/supabaseMock'
import { AuthProvider } from './AuthProvider'

const mock = vi.hoisted(() => ({ current: null as ReturnType<typeof createAuthMock> | null }))

vi.mock('@/app/supabase', () => ({
  isSupabaseConfigured: true,
  get supabase() {
    return { auth: mock.current!.auth }
  },
}))

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mock.current = createAuthMock()
  // HomePage calls the backend for /me; the auth tests do not care about its result.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'user-1', email: 'ada@example.test', display_name: 'Ada' }),
    }),
  )
})

describe('route protection', () => {
  it('sends a signed-out visitor to the login page', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('shows the home page to a signed-in user', async () => {
    mock.current!.setSession(fakeSession())
    renderApp('/')
    expect(await screen.findByRole('heading', { name: /Welcome, Ada/ })).toBeInTheDocument()
  })

  it('keeps a signed-in user away from the login page', async () => {
    mock.current!.setSession(fakeSession())
    renderApp('/login')
    expect(await screen.findByRole('heading', { name: /Welcome, Ada/ })).toBeInTheDocument()
  })

  it('unknown URLs fall back to home', async () => {
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})

describe('sign in', () => {
  it('signs in with a trimmed email and lands on the home page', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), '  ada@example.test ')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mock.current!.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ada@example.test',
      password: 'correct horse',
    })
    expect(await screen.findByRole('heading', { name: /Welcome, Ada/ })).toBeInTheDocument()
  })

  it('shows a friendly error and stays on the page when credentials are wrong', async () => {
    mock.current!.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    } as never)
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText('Email'), 'ada@example.test')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('disables submit until both fields are filled', async () => {
    renderApp('/login')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})

describe('sign up', () => {
  it('rejects a short password without calling Supabase', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters')
    expect(mock.current!.auth.signUp).not.toHaveBeenCalled()
  })

  it('asks the user to confirm their email when no session is returned', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(await screen.findByLabelText('Name (optional)'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'long enough pw')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('new@example.test')
    expect(mock.current!.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'long enough pw',
      options: { data: { display_name: 'Ada' } },
    })
  })

  it('goes straight home when Supabase returns a session (confirmation disabled)', async () => {
    mock.current!.auth.signUp.mockImplementationOnce(async () => {
      mock.current!.setSession(fakeSession('new@example.test'))
      return { data: { session: fakeSession('new@example.test'), user: {} }, error: null } as never
    })
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(await screen.findByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'long enough pw')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument()
  })
})

describe('sign out', () => {
  it('returns to the login page', async () => {
    mock.current!.setSession(fakeSession())
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(mock.current!.auth.signOut).toHaveBeenCalled())
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})
