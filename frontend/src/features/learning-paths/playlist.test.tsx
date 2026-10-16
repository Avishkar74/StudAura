import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlaylistImportItem, PlaylistImportPage } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}
const PATHS = [
  makePath({ id: 'p1', title: 'Algorithms' }),
  makePath({ id: 'p2', title: 'Networks' }),
]
const PATH_LIST = {
  'GET /api/v1/learning-paths': {
    body: { total: PATHS.length, limit: 100, offset: 0, items: PATHS },
  },
}
const URL_OK = 'https://www.youtube.com/playlist?list=PLmixed00000001'

type Status = PlaylistImportItem['status']

function item(id: string, status: Status, extra: Partial<PlaylistImportItem> = {}) {
  return {
    youtube_video_id: id,
    status,
    title: `Video ${id}`,
    position: status === 'failed' ? null : 1,
    reason: status === 'failed' ? 'unavailable' : null,
    video_id: status === 'failed' ? null : `uuid-${id}`,
    availability_state: status === 'failed' ? null : 'available',
    ...extra,
  } satisfies PlaylistImportItem
}

function many(prefix: string, count: number, status: Status = 'added') {
  return Array.from({ length: count }, (_, i) => item(`${prefix}${i}`, status))
}

function page(
  over: Partial<PlaylistImportPage> & { items: PlaylistImportItem[] },
): PlaylistImportPage {
  const count = (s: Status) => over.items.filter((i) => i.status === s).length
  return {
    added: count('added'),
    skipped: count('skipped'),
    failed: count('failed'),
    total_in_playlist: over.items.length,
    next_page_token: null,
    ...over,
  }
}

type User = ReturnType<typeof userEvent.setup>
type Dialog = ReturnType<typeof within>

async function openDialog() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Add/ }))
  await user.click(screen.getByRole('menuitem', { name: 'Import YouTube Playlist' }))
  const dialog = await screen.findByRole('dialog', { name: 'Import YouTube playlist' })
  return { user, dialog: within(dialog) }
}

async function submit(user: User, dialog: Dialog, url = URL_OK) {
  await user.type(await dialog.findByLabelText('YouTube playlist link'), url)
  await user.click(dialog.getByRole('button', { name: 'Import playlist' }))
}

const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body))

describe('Import playlist dialog', () => {
  it('asks for a learning path first when the user has none', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    expect(await dialog.findByText(/need a learning path/i)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Create a learning path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
  })

  it('imports a playlist and reports what could not be added', async () => {
    const api = mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': {
        body: page({
          items: [
            item('a', 'added'),
            item('b', 'added'),
            item('c', 'failed', { title: 'Private video' }),
            item('d', 'skipped'),
          ],
        }),
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await user.selectOptions(dialog.getByLabelText('Learning path'), 'p2')
    await submit(user, dialog, ` ${URL_OK} `)

    expect(await dialog.findByText('Imported 2 videos.')).toBeInTheDocument()
    expect(dialog.getByText('1 item could not be added.')).toBeInTheDocument()
    expect(dialog.getByText('1 video was already in this path.')).toBeInTheDocument()
    expect(dialog.getByText(/Private video — private, deleted or unavailable/)).toBeInTheDocument()
    expect(dialog.getByRole('link', { name: 'Open path' })).toHaveAttribute(
      'href',
      '/learning-paths/p2',
    )

    const post = api.calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({ youtube_url: URL_OK, learning_path_id: 'p2' }) // trimmed, no token
  })

  it('follows next_page_token through every page and shows live progress', async () => {
    const tokens: (string | undefined)[] = []
    let calls = 0
    // Hold the second page until the progress has been observed.
    let releaseSecondPage!: () => void
    const secondPage = new Promise<void>((resolve) => (releaseSecondPage = resolve))
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': (init) => {
        tokens.push(bodyOf(init).page_token)
        calls += 1
        if (calls === 1) {
          return {
            body: page({ items: many('a', 50), total_in_playlist: 70, next_page_token: 'tok50' }),
          }
        }
        return { gate: secondPage, body: page({ items: many('b', 20), total_in_playlist: 70 }) }
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)

    // Between pages the dialog shows how far along it is.
    expect(await dialog.findByText(/Importing… 50 of 70 videos checked/)).toBeInTheDocument()
    expect(dialog.getByRole('progressbar', { name: 'Playlist import progress' })).toHaveAttribute(
      'aria-valuenow',
      '71',
    )
    releaseSecondPage()
    expect(await dialog.findByText('Imported 70 videos.')).toBeInTheDocument()
    expect(tokens).toEqual([undefined, 'tok50'])
  })

  it('keeps earlier pages when a later one fails, and resumes from the same token', async () => {
    const tokens: (string | undefined)[] = []
    let calls = 0
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': (init) => {
        tokens.push(bodyOf(init).page_token)
        calls += 1
        if (calls === 1)
          return {
            body: page({ items: many('a', 50), total_in_playlist: 60, next_page_token: 'tok50' }),
          }
        if (calls === 2)
          return {
            status: 429,
            body: {
              error: {
                code: 'YOUTUBE_QUOTA_EXCEEDED',
                message: "YouTube's daily request limit has been reached. Please try again later.",
                details: [],
              },
            },
          }
        return { body: page({ items: many('b', 10), total_in_playlist: 60 }) }
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent('daily request limit')
    expect(dialog.getByText('Imported 50 videos so far.')).toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Try again' }))
    expect(await dialog.findByText('Imported 60 videos.')).toBeInTheDocument()
    expect(dialog.queryByRole('alert')).not.toBeInTheDocument()
    expect(tokens).toEqual([undefined, 'tok50', 'tok50'])
  })

  it('stays on the form with the typed link when the first request fails', async () => {
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': {
        status: 422,
        body: {
          error: {
            code: 'PLAYLIST_UNAVAILABLE',
            message: "This playlist is private or doesn't exist, so it can't be imported.",
            details: [],
          },
        },
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent('private or doesn')
    expect(dialog.getByLabelText('YouTube playlist link')).toHaveValue(URL_OK)
    expect(dialog.getByRole('button', { name: 'Import playlist' })).toBeEnabled()
  })

  it('shows a friendly message when the network fails', async () => {
    mockApi({ ...ME, ...PATH_LIST, 'POST /api/v1/playlists/import': { fail: true } })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)
    expect(await dialog.findByRole('alert')).toHaveTextContent('Check your connection')
  })

  it('can be stopped between pages and continued', async () => {
    const tokens: (string | undefined)[] = []
    let calls = 0
    // Hold the first page until Stop has been pressed, so the click can never lose a race.
    let releaseFirstPage!: () => void
    const firstPage = new Promise<void>((resolve) => (releaseFirstPage = resolve))
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': (init) => {
        tokens.push(bodyOf(init).page_token)
        calls += 1
        if (calls === 1)
          return {
            gate: firstPage,
            body: page({ items: many('a', 50), total_in_playlist: 80, next_page_token: 'tok50' }),
          }
        return { body: page({ items: many('b', 30), total_in_playlist: 80 }) }
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)
    await user.click(await dialog.findByRole('button', { name: 'Stop' }))
    releaseFirstPage()

    expect(await dialog.findByText(/Stopped\. You can continue/)).toBeInTheDocument()
    expect(dialog.getByText('Imported 50 videos so far.')).toBeInTheDocument()
    expect(calls).toBe(1) // the second page was never requested

    await user.click(dialog.getByRole('button', { name: 'Continue' }))
    expect(await dialog.findByText('Imported 80 videos.')).toBeInTheDocument()
    expect(tokens).toEqual([undefined, 'tok50'])
  })

  it('says so when everything was already in the path', async () => {
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': {
        body: page({ items: [item('a', 'skipped'), item('b', 'skipped')] }),
      },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)
    expect(await dialog.findByText('Imported 0 videos.')).toBeInTheDocument()
    expect(dialog.getByText('2 videos were already in this path.')).toBeInTheDocument()
  })

  it('handles an empty playlist', async () => {
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': { body: page({ items: [] }) },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)
    expect(await dialog.findByText('This playlist has no videos to import.')).toBeInTheDocument()
  })

  it('refreshes the learning paths so the sidebar counts update', async () => {
    const api = mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': { body: page({ items: [item('a', 'added')] }) },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    const listCalls = () => api.calls.filter((c) => c.url.includes('/learning-paths')).length
    const before = listCalls()
    await submit(user, dialog)
    await dialog.findByText('Imported 1 video.')
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before))
  })

  it('closes on Escape after an import', async () => {
    mockApi({
      ...ME,
      ...PATH_LIST,
      'POST /api/v1/playlists/import': { body: page({ items: [item('a', 'added')] }) },
    })
    renderApp()
    const { user, dialog } = await openDialog()
    await submit(user, dialog)
    await dialog.findByText('Imported 1 video.')
    // The form (and its focused button) is gone; focus must stay inside the dialog.
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
