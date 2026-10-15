import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authMock } from '@/test/supabaseMock'
import { makePath, mockApi, renderApp, setViewport } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const PATHS = Array.from({ length: 7 }, (_, i) =>
  makePath({ id: `p${i + 1}`, title: `Path ${i + 1}` }),
)

beforeEach(() => {
  mockApi({
    'GET /api/v1/me': {
      body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
    },
    'GET /api/v1/learning-paths': {
      body: { total: PATHS.length, limit: 100, offset: 0, items: PATHS },
    },
    // Opening a path from the sidebar loads its page too.
    ...Object.fromEntries(
      PATHS.flatMap((p) => [
        [`GET /api/v1/learning-paths/${p.id}`, { body: p }],
        [
          `GET /api/v1/learning-paths/${p.id}/videos`,
          { body: { total: 0, limit: 500, offset: 0, items: [] } },
        ],
      ]),
    ),
  })
})

async function renderShell(route = '/') {
  const utils = renderApp({ route })
  await screen.findByRole('navigation', { name: 'Main' })
  return utils
}

describe('layout and landmarks', () => {
  it('has a banner, main navigation, main content and a skip link', async () => {
    await renderShell()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    )
  })

  it('lists the primary destinations', async () => {
    await renderShell()
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    const expected: Record<string, string> = {
      Home: '/',
      'All Learning Paths': '/learning-paths',
      'Daily Goals': '/goals',
      'Needs Revision': '/revision',
      'My Notes': '/notes',
      'Saved Videos': '/library',
      Settings: '/settings',
    }
    for (const [label, href] of Object.entries(expected)) {
      expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
  })

  it('routes the logo and the Home item to the same dashboard (AC-14)', async () => {
    await renderShell('/goals')
    const logo = screen.getByRole('link', { name: 'StudAura home' })
    const home = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Home',
    })
    expect(logo).toHaveAttribute('href', '/')
    expect(home).toHaveAttribute('href', '/')
  })

  it('marks the current page with aria-current', async () => {
    await renderShell('/goals')
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Daily Goals' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('highlights a path, not "All Learning Paths", while viewing it', async () => {
    await renderShell('/learning-paths/p2')
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(await nav.findByRole('link', { name: 'Path 2' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'All Learning Paths' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('sets a document title per page', async () => {
    await renderShell('/goals')
    expect(document.title).toBe('Daily Goals · StudAura')
  })
})

describe('sidebar learning paths', () => {
  it('shows the first five paths and reveals the rest on demand', async () => {
    const user = userEvent.setup()
    await renderShell()
    const section = within(screen.getByRole('region', { name: 'My Learning Paths' }))
    expect(await section.findByRole('link', { name: 'Path 5' })).toBeInTheDocument()
    expect(section.queryByRole('link', { name: 'Path 6' })).not.toBeInTheDocument()

    await user.click(section.getByRole('button', { name: 'Show more' }))
    expect(section.getByRole('link', { name: 'Path 7' })).toBeInTheDocument()
    await user.click(section.getByRole('button', { name: 'Show less' }))
    expect(section.queryByRole('link', { name: 'Path 7' })).not.toBeInTheDocument()
  })

  it('opens the create dialog from the + button', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: 'Create learning path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
  })
})

describe('collapsing the sidebar (desktop)', () => {
  it('collapses to an icon rail, keeps accessible names, and remembers the choice', async () => {
    const user = userEvent.setup()
    const first = await renderShell()
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Daily Goals' })).toBeInTheDocument() // icon only
    expect(within(nav).queryByText('Daily Goals')).not.toBeInTheDocument() // no visible label
    expect(screen.queryByRole('region', { name: 'My Learning Paths' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('studaura.sidebar.collapsed')).toBe('true')

    first.unmount()
    await renderShell()
    expect(screen.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('still works when storage is unavailable', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await renderShell()
    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    expect(screen.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    vi.restoreAllMocks()
  })
})

describe('navigation drawer (mobile)', () => {
  beforeEach(() => setViewport('mobile'))

  it('is hidden from keyboard and screen readers until opened', async () => {
    const user = userEvent.setup()
    await renderShell()
    const sidebar = document.getElementById('app-sidebar')!
    expect(sidebar).toHaveAttribute('inert')

    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    expect(sidebar).not.toHaveAttribute('inert')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    await user.keyboard('{Escape}')
    expect(document.getElementById('app-sidebar')).toHaveAttribute('inert')
  })

  it('closes after choosing a destination', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Daily Goals',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Daily Goals' })).toBeInTheDocument()
    expect(document.getElementById('app-sidebar')).toHaveAttribute('inert')
  })
})

describe('search', () => {
  it('Ctrl+K focuses the search box', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('submitting opens the learning paths list with the query', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.type(screen.getByRole('searchbox'), 'graph theory{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/learning-paths?q=graph%20theory')
  })

  it('an empty search just opens the list', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.type(screen.getByRole('searchbox'), '   {Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/learning-paths$/)
  })
})

describe('Add menu', () => {
  it('offers the three actions', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: /Add/ }))
    const menu = screen.getByRole('menu', { name: 'Add' })
    expect(within(menu).getByRole('menuitem', { name: 'Add YouTube Video' })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Import YouTube Playlist' })).toBeEnabled()
    expect(within(menu).getByRole('menuitem', { name: 'Create Learning Path' })).toBeEnabled()
  })

  it('closes on Escape and on an outside click', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: /Add/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Add' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add/ }))
    await user.click(document.body)
    expect(screen.queryByRole('menu', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('opens the matching dialog', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: /Add/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Add YouTube Video' }))
    expect(await screen.findByRole('dialog', { name: 'Add YouTube video' })).toBeInTheDocument()
  })

  it('opens the playlist import dialog', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: /Add/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Import YouTube Playlist' }))
    expect(
      await screen.findByRole('dialog', { name: 'Import YouTube playlist' }),
    ).toBeInTheDocument()
  })
})

describe('profile menu', () => {
  it('shows who is signed in and links to settings', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(await screen.findByRole('button', { name: 'Account menu' }))
    const menu = screen.getByRole('menu', { name: 'Account' })
    await waitFor(() => expect(within(menu).getByText('Ada')).toBeInTheDocument())
    expect(within(menu).getByText('ada@example.test')).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    )
  })

  it('signs out', async () => {
    const user = userEvent.setup()
    await renderShell()
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(authMock.auth.signOut).toHaveBeenCalled()
  })
})
