import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Goal } from '@/api/types'
import { makePath, mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

const ME = {
  'GET /api/v1/me': {
    body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
  },
  'GET /api/v1/learning-paths': {
    body: { total: 1, limit: 100, offset: 0, items: [makePath({ id: 'p1' })] },
  },
}

function goal(over: Partial<Goal> = {}): Goal {
  return {
    daily_target_minutes: 60,
    timezone: 'UTC',
    today: '2026-10-15',
    today_watched_seconds: 2520,
    goal_achieved: false,
    ...over,
  }
}

const panel = async () => {
  const heading = await screen.findByRole('heading', { name: "Today's Goals" })
  return within(heading.closest('section') as HTMLElement)
}

describe("today's goal on the dashboard", () => {
  it('shows tracked time, progress and what is left', async () => {
    mockApi({ ...ME, 'GET /api/v1/goals': { body: goal() } })
    renderApp()
    const p = await panel()
    expect(await p.findByText(/18 min remaining/)).toBeInTheDocument()
    expect(p.getByRole('progressbar', { name: "Today's viewing goal" })).toHaveAttribute(
      'aria-valuenow',
      '70',
    )
    expect(p.getByText('42', { selector: 'strong' })).toBeInTheDocument()
  })

  it('says the goal is reached, and shows the real time when it is exceeded', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals': { body: goal({ today_watched_seconds: 4200, goal_achieved: true }) },
    })
    renderApp()
    const p = await panel()
    expect(await p.findByText(/Daily goal reached — 1 h 10 min today/)).toBeInTheDocument()
    expect(p.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('invites the student to set a goal when there is none', async () => {
    mockApi({
      ...ME,
      'GET /api/v1/goals': {
        body: goal({ daily_target_minutes: null, today_watched_seconds: 600 }),
      },
    })
    renderApp()
    const p = await panel()
    expect(await p.findByText('10 min', { selector: 'strong' })).toBeInTheDocument()
    expect(p.getByRole('button', { name: 'Set a daily goal' })).toBeInTheDocument()
    expect(p.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the tracked time in the summary cards', async () => {
    mockApi({ ...ME, 'GET /api/v1/goals': { body: goal() } })
    renderApp()
    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    await waitFor(() =>
      expect(summary.getByText('Learning Time').parentElement).toHaveTextContent('42 min'),
    )
  })

  it('sets a goal and shows it straight away', async () => {
    const user = userEvent.setup()
    let stored = goal({ daily_target_minutes: null, today_watched_seconds: 600 })
    const api = mockApi({
      ...ME,
      'GET /api/v1/goals': () => ({ body: stored }),
      'PUT /api/v1/goals': (init) => {
        const sent = JSON.parse(String(init?.body))
        stored = goal({
          daily_target_minutes: sent.daily_target_minutes,
          today_watched_seconds: 600,
        })
        return { body: stored }
      },
    })
    renderApp()
    const p = await panel()
    await user.click(await p.findByRole('button', { name: 'Set a daily goal' }))

    const dialog = await screen.findByRole('dialog', { name: 'Set a daily goal' })
    const minutes = within(dialog).getByLabelText('Minutes per day')
    expect(minutes).toHaveValue(60) // a sensible default
    await user.clear(minutes)
    await user.type(minutes, '45')
    await user.click(within(dialog).getByRole('button', { name: 'Save goal' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await p.findByText(/35 min remaining/)).toBeInTheDocument()
    const put = api.calls.find((c) => c.method === 'PUT')
    expect(put?.body).toMatchObject({ daily_target_minutes: 45 })
    expect((put?.body as { timezone: string }).timezone).toBeTruthy()
  })

  it('picks a preset and edits an existing goal', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/goals': { body: goal() },
      'PUT /api/v1/goals': { body: goal({ daily_target_minutes: 120 }) },
    })
    renderApp()
    const p = await panel()
    await user.click(await p.findByRole('button', { name: 'Edit goal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit daily goal' })
    expect(within(dialog).getByLabelText('Minutes per day')).toHaveValue(60)
    await user.click(within(dialog).getByRole('button', { name: '120 min' }))
    expect(within(dialog).getByLabelText('Minutes per day')).toHaveValue(120)
    await user.click(within(dialog).getByRole('button', { name: 'Save goal' }))
    expect(await p.findByText(/1 h 18 min remaining/)).toBeInTheDocument()
  })

  it.each(['0', '1441', '', '2.5'])('rejects %j without calling the server', async (value) => {
    const user = userEvent.setup()
    const api = mockApi({
      ...ME,
      'GET /api/v1/goals': { body: goal({ daily_target_minutes: null }) },
    })
    renderApp()
    const p = await panel()
    await user.click(await p.findByRole('button', { name: 'Set a daily goal' }))
    const dialog = await screen.findByRole('dialog')
    const minutes = within(dialog).getByLabelText('Minutes per day')
    await user.clear(minutes)
    if (value) await user.type(minutes, value)
    await user.click(within(dialog).getByRole('button', { name: 'Save goal' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/whole number of minutes/)
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('keeps the dialog open with an error when saving fails', async () => {
    const user = userEvent.setup()
    mockApi({
      ...ME,
      'GET /api/v1/goals': { body: goal({ daily_target_minutes: null }) },
      'PUT /api/v1/goals': { fail: true },
    })
    renderApp()
    const p = await panel()
    await user.click(await p.findByRole('button', { name: 'Set a daily goal' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save goal' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Could not save your goal/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers a retry when the goal cannot be loaded', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      ...ME,
      'GET /api/v1/goals': () => (++attempts <= 2 ? { status: 500 } : { body: goal() }),
    })
    renderApp()
    const p = await panel()
    expect(await p.findByRole('alert')).toHaveTextContent(/Couldn't load your daily goal/)
    await user.click(p.getByRole('button', { name: 'Try again' }))
    expect(await p.findByText(/18 min remaining/)).toBeInTheDocument()
  })
})
