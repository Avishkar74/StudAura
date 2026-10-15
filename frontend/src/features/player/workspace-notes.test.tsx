import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Editor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note, PathVideo } from '@/api/types'
import { installFakeYouTube, uninstallFakeYouTube } from '@/test/fakeYouTube'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'user-1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
}

function video(id: string, position: number): PathVideo {
  return {
    position,
    video: {
      id,
      youtube_video_id: `yt${id}`.padEnd(11, 'x'),
      title: `Lesson ${position}`,
      channel_title: null,
      thumbnail_url: null,
      duration_seconds: 600,
      availability_state: 'available',
    },
    learning_status: 'NOT_STARTED',
    last_position_seconds: 0,
    playback_pct: 0,
    ever_completed_at: null,
    last_watched_at: null,
  }
}

const note = (videoId: string, body: string, revision = 1): Note => ({
  video_id: videoId,
  body,
  revision,
  updated_at: '2026-10-15T11:00:00Z',
})

function api(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    ...ME,
    'GET /api/v1/learning-paths': {
      body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1', title: 'DSA' })] },
    },
    'GET /api/v1/learning-paths/p1': { body: makePath({ id: 'p1', title: 'DSA' }) },
    'GET /api/v1/learning-paths/p1/videos': {
      body: { total: 2, limit: 500, offset: 0, items: [video('v1', 1), video('v2', 2)] },
    },
    'GET /api/v1/videos/v1/notes': { body: note('v1', '<p>Notes for lesson one</p>') },
    'GET /api/v1/videos/v2/notes': { body: note('v2', '<p>Notes for lesson two</p>') },
    'PUT /api/v1/videos/v1/notes': { body: note('v1', '<p>x</p>', 2) },
    'PUT /api/v1/videos/v2/notes': { body: note('v2', '<p>x</p>', 2) },
    'PUT /api/v1/videos/v1/progress': { body: {} },
    ...extra,
  })
}

beforeEach(() => {
  installFakeYouTube()
  window.sessionStorage.clear()
})
afterEach(() => uninstallFakeYouTube())

const noteBox = () => screen.findByRole('textbox', { name: 'Note' })

describe('workspace panel tabs', () => {
  it('opens on the Notes tab with the note for this video', async () => {
    api()
    renderApp({ route: '/learn/p1/v1' })
    const tab = await screen.findByRole('tab', { name: 'Notes' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(await noteBox()).toHaveTextContent('Notes for lesson one')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab.id)
  })

  it('switches tabs with the mouse and with the arrow keys', async () => {
    const user = userEvent.setup()
    api()
    renderApp({ route: '/learn/p1/v1' })
    await noteBox()

    await user.click(screen.getByRole('tab', { name: 'Comments' }))
    expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveFocus()
  })

  it('only the selected tab is in the tab order', async () => {
    api()
    renderApp({ route: '/learn/p1/v1' })
    await noteBox()
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Comments' })).toHaveAttribute('tabindex', '-1')
  })

  it('remembers the chosen tab for the browser session', async () => {
    const user = userEvent.setup()
    api()
    const first = renderApp({ route: '/learn/p1/v1' })
    await noteBox()
    await user.click(screen.getByRole('tab', { name: 'Progress' }))
    first.unmount()

    renderApp({ route: '/learn/p1/v1' })
    expect(await screen.findByRole('tab', { name: 'Progress' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})

describe('switching videos', () => {
  it("shows the next video's note, never the previous one's", async () => {
    const user = userEvent.setup()
    api()
    renderApp({ route: '/learn/p1/v1' })
    expect(await noteBox()).toHaveTextContent('Notes for lesson one')

    await user.click(screen.getByRole('link', { name: /Next: Lesson 2/ }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent(
        'Notes for lesson two',
      ),
    )
    expect(screen.getByRole('textbox', { name: 'Note' })).not.toHaveTextContent('lesson one')
  })

  it('saves unsaved text to the video it was typed on when leaving it', async () => {
    const user = userEvent.setup()
    const calls = api()
    renderApp({ route: '/learn/p1/v1' })
    await noteBox()
    // Reach the editor through the DOM node ProseMirror attaches it to.
    const dom = (await noteBox()) as HTMLElement & { editor?: Editor }
    const editor = dom.editor
    expect(editor).toBeDefined()

    act(() => void editor!.chain().focus('end').insertContent(' plus my edit').run())
    // Leave before the 1.5 s debounce could possibly have fired.
    await user.click(screen.getByRole('link', { name: /Next: Lesson 2/ }))

    await waitFor(() => {
      const put = calls.calls.find((c) => c.method === 'PUT' && c.url.includes('/videos/v1/notes'))
      expect(put?.body).toEqual({
        body: '<p>Notes for lesson one plus my edit</p>',
        base_revision: 1,
      })
    })
    // ...and nothing was written to the other video.
    expect(calls.calls.some((c) => c.method === 'PUT' && c.url.includes('/videos/v2/notes'))).toBe(
      false,
    )
  })
})

describe('Upload Notes', () => {
  it('lives in the notes panel and opens the coming-soon modal', async () => {
    const user = userEvent.setup()
    api()
    renderApp({ route: '/learn/p1/v1' })
    await noteBox()
    const panel = within(screen.getByRole('complementary', { name: 'Notes and progress' }))
    await user.click(panel.getByRole('button', { name: 'Upload Notes (Coming soon)' }))
    expect(await screen.findByRole('dialog', { name: 'Upload notes' })).toBeInTheDocument()
  })
})
