import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('landing page', () => {
  it('has one h1 and the main sections, in landmarks', async () => {
    renderApp({ route: '/', signedIn: false })
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    for (const name of [
      /Everything a self-taught learner needs/,
      'How it works',
      'Built to be trusted',
      'Questions',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('sends people to sign up or sign in', async () => {
    renderApp({ route: '/', signedIn: false })
    const main = within(await screen.findByRole('main'))
    expect(main.getAllByRole('link', { name: 'Start learning free' })[0]).toHaveAttribute(
      'href',
      '/signup',
    )
    expect(main.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login')
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/signup')
  })

  it('lists the six features and four steps', async () => {
    renderApp({ route: '/', signedIn: false })
    const features = within(
      (await screen.findByRole('heading', { name: /Everything a self-taught/ })).closest(
        'section',
      )!,
    )
    expect(features.getAllByRole('listitem')).toHaveLength(6)
    const how = within(screen.getByRole('heading', { name: 'How it works' }).closest('section')!)
    expect(how.getAllByRole('listitem')).toHaveLength(4)
  })

  it('offers a skip link and an accessible description of the preview', async () => {
    renderApp({ route: '/', signedIn: false })
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main',
    )
    expect(
      screen.getByRole('img', { name: /Preview of the StudAura workspace/ }),
    ).toBeInTheDocument()
  })

  it('is replaced by the dashboard once signed in', async () => {
    renderApp({ route: '/' })
    expect(await screen.findByRole('heading', { name: /Ready to learn today/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /learning you actually finish/i })).toBeNull()
  })
})
