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

const list = (items: ReturnType<typeof makePath>[]) => ({
  body: { total: items.length, limit: 100, offset: 0, items },
})

async function openFromAddMenu(item: 'Add YouTube Video' | 'Create Learning Path') {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Add/ }))
  await user.click(screen.getByRole('menuitem', { name: item }))
  return user
}

describe('Create learning path dialog', () => {
  it('sends the details, closes, and opens the new path', async () => {
    const api = mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list([]),
      'POST /api/v1/learning-paths': { status: 201, body: makePath({ id: 'new-1', title: 'OS' }) },
    })
    renderApp()
    const user = await openFromAddMenu('Create Learning Path')

    await user.type(screen.getByLabelText('Title'), '  Operating Systems ')
    await user.type(screen.getByLabelText('Description (optional)'), 'Processes and memory')
    await user.type(screen.getByLabelText('Target date (optional)'), '2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Create path' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Create learning path' })).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/learning-paths/new-1')
    const post = api.calls.find((c) => c.method === 'POST')!
    expect(post.body).toEqual({
      title: 'Operating Systems',
      description: 'Processes and memory',
      target_date: '2026-12-01',
    })
  })

  it('needs a title before it can be submitted', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': list([]) })
    renderApp()
    const user = await openFromAddMenu('Create Learning Path')
    const submit = screen.getByRole('button', { name: 'Create path' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Title'), '   ')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Title'), 'Real title')
    expect(submit).toBeEnabled()
  })

  it('keeps the dialog and the typed text when the server rejects the request', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list([]),
      'POST /api/v1/learning-paths': {
        status: 422,
        body: { error: { code: 'VALIDATION_ERROR', message: 'bad', details: [] } },
      },
    })
    renderApp()
    const user = await openFromAddMenu('Create Learning Path')
    await user.type(screen.getByLabelText('Title'), 'My path')
    await user.click(screen.getByRole('button', { name: 'Create path' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please check the details')
    expect(screen.getByLabelText('Title')).toHaveValue('My path')
  })

  it('shows a generic error when the network fails', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list([]),
      'POST /api/v1/learning-paths': { fail: true },
    })
    renderApp()
    const user = await openFromAddMenu('Create Learning Path')
    await user.type(screen.getByLabelText('Title'), 'My path')
    await user.click(screen.getByRole('button', { name: 'Create path' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the learning path')
  })

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': list([]) })
    renderApp()
    const user = userEvent.setup()
    const addButton = await screen.findByRole('button', { name: 'Create a learning path' })
    await user.click(addButton)
    expect(screen.getByLabelText('Title')).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(addButton).toHaveFocus()
  })

  it('keeps Tab inside the dialog', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': list([]) })
    renderApp()
    const user = await openFromAddMenu('Create Learning Path')
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 12; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})

describe('Add YouTube video dialog', () => {
  const PATHS = [
    makePath({ id: 'p1', title: 'Algorithms' }),
    makePath({ id: 'p2', title: 'Networks' }),
  ]
  const VIDEO = {
    id: 'v1',
    youtube_video_id: 'dQw4w9WgXcQ',
    title: 'Binary Search',
    channel_title: null,
    thumbnail_url: null,
    duration_seconds: 600,
    availability_state: 'available',
  }

  it('asks for a path first when the user has none', async () => {
    mockApi({ ...ME, 'GET /api/v1/learning-paths': list([]) })
    renderApp()
    const user = await openFromAddMenu('Add YouTube Video')
    expect(await screen.findByText(/need a learning path/i)).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Add YouTube video' })
    await user.click(within(dialog).getByRole('button', { name: 'Create a learning path' }))
    expect(await screen.findByRole('dialog', { name: 'Create learning path' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Add YouTube video' })).not.toBeInTheDocument()
  })

  it('adds the video to the chosen path', async () => {
    const api = mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list(PATHS),
      'POST /api/v1/videos/import': {
        status: 201,
        body: { status: 'added', reason: null, position: 1, video: VIDEO },
      },
    })
    renderApp()
    const user = await openFromAddMenu('Add YouTube Video')

    await user.type(
      await screen.findByLabelText('YouTube video link'),
      ' https://youtu.be/dQw4w9WgXcQ ',
    )
    await user.selectOptions(screen.getByLabelText('Learning path'), 'p2')
    await user.click(screen.getByRole('button', { name: 'Add video' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Added Binary Search to Networks')
    const post = api.calls.find((c) => c.url.includes('/videos/import'))!
    expect(post.body).toEqual({
      youtube_url: 'https://youtu.be/dQw4w9WgXcQ',
      learning_path_id: 'p2',
    })
    // Ready for the next one.
    expect(screen.getByLabelText('YouTube video link')).toHaveValue('')
  })

  it('says so when the video is already in the path', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list(PATHS),
      'POST /api/v1/videos/import': {
        body: { status: 'skipped', reason: 'already_in_path', position: 1, video: VIDEO },
      },
    })
    renderApp()
    const user = await openFromAddMenu('Add YouTube Video')
    await user.type(await screen.findByLabelText('YouTube video link'), 'https://youtu.be/dQw4w9WgXcQ')
    await user.click(screen.getByRole('button', { name: 'Add video' }))
    expect(await screen.findByRole('status')).toHaveTextContent('is already in Algorithms')
  })

  it('warns when embedding is disabled', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list(PATHS),
      'POST /api/v1/videos/import': {
        status: 201,
        body: {
          status: 'added',
          reason: null,
          position: 1,
          video: { ...VIDEO, availability_state: 'embed_disabled' },
        },
      },
    })
    renderApp()
    const user = await openFromAddMenu('Add YouTube Video')
    await user.type(await screen.findByLabelText('YouTube video link'), 'https://youtu.be/dQw4w9WgXcQ')
    await user.click(screen.getByRole('button', { name: 'Add video' }))
    expect(await screen.findByRole('status')).toHaveTextContent('disabled embedding')
  })

  it("shows the server's explanation when the video can't be added", async () => {
    mockApi({
      ...ME,
      'GET /api/v1/learning-paths': list(PATHS),
      'POST /api/v1/videos/import': {
        status: 422,
        body: {
          error: {
            code: 'VIDEO_UNAVAILABLE',
            message: "This video is private, removed or unavailable, so it can't be added.",
            details: [],
          },
        },
      },
    })
    renderApp()
    const user = await openFromAddMenu('Add YouTube Video')
    await user.type(await screen.findByLabelText('YouTube video link'), 'https://youtu.be/privateVid1')
    await user.click(screen.getByRole('button', { name: 'Add video' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('private, removed or unavailable')
    expect(screen.getByLabelText('YouTube video link')).toHaveValue('https://youtu.be/privateVid1')
  })
})
