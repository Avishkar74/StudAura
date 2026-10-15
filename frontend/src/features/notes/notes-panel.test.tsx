import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Editor } from '@tiptap/react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note } from '@/api/types'
import { AuthContext } from '@/features/auth/authContext'
import { mockApi } from '@/test/renderApp'
import { saveDraft } from './drafts'
import { NotesPanel } from './NotesPanel'

const DEBOUNCE = 40 // the real value is 1.5 s; the hook tests cover that with fake timers
const NOTES_URL = '/api/v1/videos/v1/notes'

const AUTH = {
  status: 'signedIn' as const,
  session: null,
  user: { id: 'u1', email: 'ada@example.test' } as never,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signOut: async () => {},
}

function saved(body: string, revision: number): Note {
  return { video_id: 'v1', body, revision, updated_at: '2026-10-15T11:58:00Z' }
}

let editor: Editor

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={AUTH}>
        <NotesPanel videoId="v1" debounceMs={DEBOUNCE} onEditor={(e) => (editor = e)} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return utils
}

async function ready() {
  await screen.findByRole('toolbar', { name: 'Text formatting' })
  await waitFor(() => expect(editor).toBeDefined())
}

const type = (text: string) => act(() => void editor.chain().focus('end').insertContent(text).run())
const puts = (api: ReturnType<typeof mockApi>) => api.calls.filter((c) => c.method === 'PUT')

beforeEach(() => {
  // @ts-expect-error reset between tests
  editor = undefined
})
afterEach(() => vi.restoreAllMocks())

describe('loading', () => {
  it('shows the saved note', async () => {
    mockApi({ [`GET ${NOTES_URL}`]: { body: saved('<p>Binary search halves the range.</p>', 2) } })
    renderPanel()
    await ready()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent(
      'Binary search halves the range.',
    )
    expect(screen.getByText(/Saved .* ago|Saved just now|Saved/)).toBeInTheDocument()
  })

  it('shows an empty editor for a video with no note yet, with nothing "saved" claimed', async () => {
    mockApi({
      [`GET ${NOTES_URL}`]: { body: { video_id: 'v1', body: '', revision: 0, updated_at: null } },
    })
    renderPanel()
    await ready()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent('')
    expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument()
  })

  it('shows a retryable error when the note cannot be loaded', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      [`GET ${NOTES_URL}`]: () =>
        ++attempts === 1 ? { status: 500, body: {} } : { body: saved('<p>back</p>', 1) },
    })
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your note")
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await ready()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent('back')
  })
})

describe('autosave', () => {
  it('shows Saving… then Saved, and sends the text with the revision it started from', async () => {
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>old</p>', 2) },
      [`PUT ${NOTES_URL}`]: { delay: 60, body: saved('<p>old new</p>', 3) },
    })
    renderPanel()
    await ready()

    type(' new')
    expect(await screen.findByText('Unsaved changes…')).toBeInTheDocument()
    expect(await screen.findByText('Saving…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/^Saved/)).toBeInTheDocument())

    expect(puts(api)).toHaveLength(1)
    expect(puts(api)[0].body).toEqual({ body: '<p>old new</p>', base_revision: 2 })
  })

  it('a note that was never saved is created with revision 0 as its base', async () => {
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: { video_id: 'v1', body: '', revision: 0, updated_at: null } },
      [`PUT ${NOTES_URL}`]: { body: saved('<p>first</p>', 1) },
    })
    renderPanel()
    await ready()
    type('first')
    await waitFor(() => expect(puts(api)).toHaveLength(1))
    expect(puts(api)[0].body).toEqual({ body: '<p>first</p>', base_revision: 0 })
  })

  it('stores a cleared note as an empty string rather than an empty paragraph', async () => {
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>delete me</p>', 1) },
      [`PUT ${NOTES_URL}`]: { body: saved('', 2) },
    })
    renderPanel()
    await ready()
    act(() => void editor.commands.clearContent(true))
    await waitFor(() => expect(puts(api)).toHaveLength(1))
    expect(puts(api)[0].body).toEqual({ body: '', base_revision: 1 })
  })

  it('keeps the text and offers Retry when saving fails, then recovers', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>a</p>', 1) },
      [`PUT ${NOTES_URL}`]: () =>
        ++attempts === 1 ? { fail: true } : { body: saved('<p>ab</p>', 2) },
    })
    renderPanel()
    await ready()
    type('b')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save your note")
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent('ab') // still there

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText(/^Saved/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(puts(api).map((c) => c.body)).toEqual([
      { body: '<p>ab</p>', base_revision: 1 },
      { body: '<p>ab</p>', base_revision: 1 },
    ])
  })
})

describe('conflicts', () => {
  const OTHER = saved('<p>written in another tab</p>', 5)
  const conflict = {
    status: 409,
    body: { error: { code: 'NOTE_CONFLICT', message: 'changed', details: [{ current: OTHER }] } },
  }

  it('asks which version to keep and never overwrites on its own', async () => {
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>mine</p>', 2) },
      [`PUT ${NOTES_URL}`]: conflict,
    })
    renderPanel()
    await ready()
    type(' edited')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('changed in another tab or on another device')
    expect(screen.getByText('Not saved: this note changed elsewhere.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent('mine edited')
    expect(puts(api)).toHaveLength(1)
  })

  it('"Keep my version" saves my text over the newer revision', async () => {
    const user = userEvent.setup()
    let attempts = 0
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>mine</p>', 2) },
      [`PUT ${NOTES_URL}`]: () =>
        ++attempts === 1 ? conflict : { body: saved('<p>mine edited</p>', 6) },
    })
    renderPanel()
    await ready()
    type(' edited')
    await user.click(await screen.findByRole('button', { name: 'Keep my version' }))

    await waitFor(() => expect(screen.getByText(/^Saved/)).toBeInTheDocument())
    expect(puts(api)[1].body).toEqual({ body: '<p>mine edited</p>', base_revision: 5 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('"Use the saved version" replaces my text with the other one', async () => {
    const user = userEvent.setup()
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>mine</p>', 2) },
      [`PUT ${NOTES_URL}`]: conflict,
    })
    renderPanel()
    await ready()
    type(' edited')
    await user.click(await screen.findByRole('button', { name: 'Use the saved version' }))

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent(
      'written in another tab',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(puts(api)).toHaveLength(1) // nothing else was sent
  })
})

describe('recovering unsaved text', () => {
  it('offers back text that was typed but never saved, and restoring it saves it', async () => {
    const user = userEvent.setup()
    saveDraft('u1', 'v1', {
      body: '<p>typed before the crash</p>',
      baseRevision: 2,
      savedAt: '2026-10-15T11:00:00Z',
    })
    const api = mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>older</p>', 2) },
      [`PUT ${NOTES_URL}`]: { body: saved('<p>typed before the crash</p>', 3) },
    })
    renderPanel()
    await ready()

    const banner = await screen.findByRole('region', { name: 'Unsaved changes found' })
    expect(banner).toHaveTextContent('were found on this device')

    await user.click(within(banner).getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent(
      'typed before the crash',
    )
    await waitFor(() => expect(puts(api)).toHaveLength(1))
    expect(puts(api)[0].body).toEqual({ body: '<p>typed before the crash</p>', base_revision: 2 })
    expect(screen.queryByRole('region', { name: 'Unsaved changes found' })).not.toBeInTheDocument()
  })

  it('discarding keeps the saved note and removes the backup', async () => {
    const user = userEvent.setup()
    saveDraft('u1', 'v1', { body: '<p>junk</p>', baseRevision: 2, savedAt: '' })
    const api = mockApi({ [`GET ${NOTES_URL}`]: { body: saved('<p>good</p>', 2) } })
    renderPanel()
    await ready()
    await user.click(await screen.findByRole('button', { name: 'Discard' }))

    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveTextContent('good')
    expect(window.localStorage.getItem('studaura.note-draft.u1.v1')).toBeNull()
    expect(puts(api)).toHaveLength(0)
  })

  it('ignores a backup that matches what is already saved', async () => {
    saveDraft('u1', 'v1', { body: '<p>same</p>', baseRevision: 2, savedAt: '' })
    mockApi({ [`GET ${NOTES_URL}`]: { body: saved('<p>same</p>', 2) } })
    renderPanel()
    await ready()
    expect(screen.queryByRole('region', { name: 'Unsaved changes found' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('studaura.note-draft.u1.v1')).toBeNull()
  })

  it("does not offer another person's backup", async () => {
    saveDraft('someone-else', 'v1', { body: '<p>private</p>', baseRevision: 0, savedAt: '' })
    mockApi({ [`GET ${NOTES_URL}`]: { body: saved('<p>mine</p>', 1) } })
    renderPanel()
    await ready()
    expect(screen.queryByRole('region', { name: 'Unsaved changes found' })).not.toBeInTheDocument()
  })
})

describe('formatting toolbar', () => {
  beforeEach(() => {
    mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p>some text</p>', 1) },
      [`PUT ${NOTES_URL}`]: { body: saved('<p>x</p>', 2) },
    })
  })

  async function select() {
    renderPanel()
    await ready()
    act(() => void editor.commands.selectAll())
  }

  it('applies and reflects bold, italic, underline, strikethrough and code', async () => {
    const user = userEvent.setup()
    await select()
    const cases: [string, string, string][] = [
      ['Bold', '<strong>', 'bold'],
      ['Italic', '<em>', 'italic'],
      ['Underline', '<u>', 'underline'],
      ['Strikethrough', '<s>', 'strike'],
      ['Code', '<code>', 'code'],
    ]
    for (const [label, tag, mark] of cases) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(editor.getHTML()).toContain(tag)
      expect(editor.isActive(mark)).toBe(true)
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      await user.click(screen.getByRole('button', { name: label })) // toggle off again
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('makes bulleted and numbered lists', async () => {
    const user = userEvent.setup()
    await select()
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }))
    expect(editor.getHTML()).toContain('<ul>')
    await user.click(screen.getByRole('button', { name: 'Numbered list' }))
    expect(editor.getHTML()).toContain('<ol>')
  })

  it('changes the text style to a heading and back', async () => {
    const user = userEvent.setup()
    await select()
    await user.selectOptions(screen.getByLabelText('Text style'), '2')
    expect(editor.getHTML()).toContain('<h2>')
    await user.selectOptions(screen.getByLabelText('Text style'), '0')
    expect(editor.getHTML()).not.toContain('<h2>')
  })

  it('adds and removes a link', async () => {
    const user = userEvent.setup()
    await select()
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.type(screen.getByLabelText('Link address'), 'https://example.test/page')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(editor.getHTML()).toContain('href="https://example.test/page"')

    act(() => void editor.commands.selectAll())
    await user.click(screen.getByRole('button', { name: 'Link' }))
    await user.clear(screen.getByLabelText('Link address'))
    await user.click(screen.getByRole('button', { name: 'Remove link' }))
    expect(editor.getHTML()).not.toContain('href=')
  })

  it('formatting is an edit like any other and gets saved', async () => {
    const user = userEvent.setup()
    await select()
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    expect(await screen.findByText('Unsaved changes…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/^Saved/)).toBeInTheDocument())
  })
})

describe('content safety', () => {
  it('does not render scripts or event handlers that arrive in a saved note', async () => {
    mockApi({
      [`GET ${NOTES_URL}`]: {
        body: saved(
          '<p onclick="x()">hi</p><script>window.__pwned = true</script><img src=x onerror="window.__pwned=true">',
          1,
        ),
      },
    })
    renderPanel()
    await ready()
    const note = screen.getByRole('textbox', { name: 'Note' })
    expect(note.querySelector('script, img')).toBeNull()
    expect(note.innerHTML).not.toContain('onclick')
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined()
  })

  it('drops javascript: links when loading', async () => {
    mockApi({
      [`GET ${NOTES_URL}`]: { body: saved('<p><a href="javascript:alert(1)">bad</a></p>', 1) },
    })
    renderPanel()
    await ready()
    expect(screen.getByRole('textbox', { name: 'Note' }).innerHTML).not.toContain('javascript:')
  })
})

describe('Upload Notes (coming soon)', () => {
  it('opens a modal and uploads nothing', async () => {
    const user = userEvent.setup()
    const api = mockApi({ [`GET ${NOTES_URL}`]: { body: saved('<p>x</p>', 1) } })
    renderPanel()
    await ready()

    await user.click(screen.getByRole('button', { name: 'Upload Notes (Coming soon)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Upload notes' })
    expect(within(dialog).getByText('Coming soon')).toBeInTheDocument()
    expect(dialog.querySelector('input[type="file"]')).toBeNull() // no file input at all

    await user.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.every((c) => c.method === 'GET')).toBe(true)
  })
})
