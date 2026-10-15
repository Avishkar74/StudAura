import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { VideoComment } from '@/api/types'
import { mockApi } from '@/test/renderApp'
import { CommentsPanel } from './CommentsPanel'

const URL = '/api/v1/videos/v1/comments'

function comment(id: string, body: string, at: number | null = null): VideoComment {
  return { id, video_id: 'v1', body, timestamp_seconds: at, created_at: '2026-10-15T11:58:00Z' }
}

function renderPanel(props: Partial<Parameters<typeof CommentsPanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommentsPanel videoId="v1" getCurrentTime={() => 125.7} {...props} />
    </QueryClientProvider>,
  )
}

describe('comments panel', () => {
  it('lists comments with their timestamps', async () => {
    mockApi({ [`GET ${URL}`]: { body: [comment('c1', 'Revisit this', 90), comment('c2', 'Hmm')] } })
    renderPanel()
    expect(await screen.findByText('Revisit this')).toBeInTheDocument()
    expect(screen.getByText('1:30')).toBeInTheDocument()
    expect(screen.getByText('Hmm')).toBeInTheDocument()
  })

  it('says so when there are no comments', async () => {
    mockApi({ [`GET ${URL}`]: { body: [] } })
    renderPanel()
    expect(await screen.findByText(/No comments yet/)).toBeInTheDocument()
  })

  it('adds a comment, with the current video time when asked', async () => {
    const user = userEvent.setup()
    let stored: VideoComment[] = []
    const api = mockApi({
      [`GET ${URL}`]: () => ({ body: stored }),
      [`POST ${URL}`]: (init) => {
        const sent = JSON.parse(String(init?.body))
        stored = [comment('c9', sent.body, sent.timestamp_seconds)]
        return { status: 201, body: stored[0] }
      },
    })
    renderPanel()
    await screen.findByText(/No comments yet/)

    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), '  Why O(log n)?  ')
    await user.click(screen.getByRole('checkbox', { name: /Attach the current video time/ }))
    expect(screen.getByText('At 2:05')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByText('Why O(log n)?')).toBeInTheDocument()
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({
      body: 'Why O(log n)?',
      timestamp_seconds: 125,
    })
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveValue('')
  })

  it('does not send an empty comment', async () => {
    mockApi({ [`GET ${URL}`]: { body: [] } })
    renderPanel()
    await screen.findByText(/No comments yet/)
    const send = screen.getByRole('button', { name: 'Add comment' })
    expect(send).toBeDisabled()
    await userEvent.setup().type(screen.getByRole('textbox', { name: 'Add a comment' }), '   ')
    expect(send).toBeDisabled()
  })

  it('keeps the text when saving fails, so it can be sent again', async () => {
    const user = userEvent.setup()
    let fail = true
    mockApi({
      [`GET ${URL}`]: { body: [] },
      [`POST ${URL}`]: () =>
        fail ? { fail: true } : { status: 201, body: comment('c1', 'Keep me') },
    })
    renderPanel()
    await screen.findByText(/No comments yet/)
    await user.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'Keep me')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save your comment/)
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveValue('Keep me')

    fail = false
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveValue(''),
    )
  })

  it('deletes a comment', async () => {
    const user = userEvent.setup()
    let stored = [comment('c1', 'Gone soon'), comment('c2', 'Stays')]
    const api = mockApi({
      [`GET ${URL}`]: () => ({ body: stored }),
      'DELETE /api/v1/comments/c1': () => {
        stored = stored.filter((c) => c.id !== 'c1')
        return { status: 204 }
      },
    })
    renderPanel()
    const item = (await screen.findByText('Gone soon')).closest('li') as HTMLElement
    await user.click(within(item).getByRole('button', { name: 'Delete comment' }))

    await waitFor(() => expect(screen.queryByText('Gone soon')).not.toBeInTheDocument())
    expect(screen.getByText('Stays')).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/comments/c1'))).toBe(
      true,
    )
  })

  it('jumps the player to a comment timestamp', async () => {
    const onSeek = vi.fn()
    mockApi({ [`GET ${URL}`]: { body: [comment('c1', 'Here', 90)] } })
    renderPanel({ onSeek })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Jump to 1:30' }))
    expect(onSeek).toHaveBeenCalledWith(90)
  })

  it('offers a retry when comments cannot be loaded', async () => {
    mockApi({ [`GET ${URL}`]: { fail: true } })
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load your comments/)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
