import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Goal } from '@/api/types'
import { mockApi, renderApp } from '@/test/renderApp'

vi.mock('@/app/supabase', async () => (await import('@/test/supabaseMock')).supabaseModule)

function goal(watchedSeconds: number, target = 60): Goal {
  return {
    daily_target_minutes: target,
    timezone: 'UTC',
    today: '2026-10-15',
    today_watched_seconds: watchedSeconds,
    week_watched_seconds: watchedSeconds,
    daily: [],
    goal_achieved: watchedSeconds >= target * 60,
  }
}

async function todayText(g: Goal) {
  mockApi({
    'GET /api/v1/me': {
      body: { id: 'u1', email: 'ada@example.test', display_name: 'Ada', created_at: '' },
    },
    'GET /api/v1/learning-paths': { body: { total: 0, limit: 100, offset: 0, items: [] } },
    'GET /api/v1/goals': { body: g },
  })
  renderApp({ route: '/goals' })
  const section = (await screen.findByRole('heading', { name: /Today/ })).closest('section')
  return within(section as HTMLElement)
}

describe('the daily goal numbers add up', () => {
  it('shows 2 watched and 58 left after 2 minutes 5 seconds, not 57', async () => {
    const today = await todayText(goal(125))
    expect(await today.findByText(/58 min remaining/)).toBeInTheDocument()
    expect(today.getByText('2')).toBeInTheDocument()
    expect(today.queryByText(/57 min/)).not.toBeInTheDocument()
  })

  it('counts a part-minute as time still to go', async () => {
    const today = await todayText(goal(59))
    expect(await today.findByText(/1 h remaining/)).toBeInTheDocument()
  })

  it('is exact on a whole minute', async () => {
    const today = await todayText(goal(600))
    expect(await today.findByText(/50 min remaining/)).toBeInTheDocument()
  })

  it('switches to hours when a lot is left', async () => {
    const today = await todayText(goal(0, 90))
    expect(await today.findByText(/1 h 30 min remaining/)).toBeInTheDocument()
  })

  it('says the goal was reached instead of a countdown', async () => {
    const today = await todayText(goal(3700))
    expect(await today.findByText(/Daily goal reached/)).toBeInTheDocument()
    expect(today.queryByText(/remaining/)).not.toBeInTheDocument()
  })
})
