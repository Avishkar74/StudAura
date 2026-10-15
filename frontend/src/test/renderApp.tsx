import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import type { LearningPath } from '@/api/types'
import { App } from '@/app/App'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { authMock, fakeSession } from './supabaseMock'
export { setViewport } from './viewport'

export function makePath(overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id: 'path-1',
    title: 'Data Structures',
    description: null,
    target_date: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    total_videos: 10,
    completed_videos: 4,
    in_progress_videos: 1,
    needs_revision_videos: 0,
    completion_pct: 40,
    last_activity_at: null,
    ...overrides,
  }
}

export interface ApiReply {
  status?: number
  body?: unknown
  /** Reject the request (network failure). */
  fail?: boolean
  /** Hold the response for this many milliseconds (to observe loading states). */
  delay?: number
}

type Handler = ApiReply | ((init: RequestInit | undefined, url: string) => ApiReply)

/**
 * Stubs `fetch` for the backend. Keys are "METHOD /path-prefix"; the longest match wins.
 * Unmatched requests get a 404 so a missing stub fails loudly instead of hanging.
 */
export function mockApi(routes: Record<string, Handler>) {
  // The dashboard always asks for the daily goal; tests that don't care get "no goal yet"...
  routes = {
    'GET /api/v1/goals': {
      body: {
        daily_target_minutes: null,
        timezone: 'UTC',
        today: '2026-10-15',
        today_watched_seconds: 0,
        week_watched_seconds: 0,
        goal_achieved: false,
      },
    },
    // ...nothing watched yet...
    'GET /api/v1/dashboard': { body: { continue_learning: null, recently_watched: [] } },
    // ...and an empty revision queue; a video that is not in it.
    'GET /api/v1/revisions': {
      body: { today: '2026-10-15', timezone: 'UTC', total: 0, due_count: 0, items: [] },
    },
    'GET /revision': {
      body: {
        video_id: 'v',
        learning_status: 'IN_PROGRESS',
        active: false,
        due_at: null,
        flagged_at: null,
        revised_at: null,
        due_state: null,
        today: '2026-10-15',
      },
    },
    ...routes,
  }
  const calls: { method: string; url: string; body: unknown }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '')
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown = undefined
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    calls.push({ method, url, body })

    const key = Object.keys(routes)
      .filter((k) => {
        const [m, prefix] = k.split(' ')
        return m === method && url.includes(prefix)
      })
      .sort((a, b) => b.length - a.length)[0]
    const handler = key ? routes[key] : undefined
    const reply = typeof handler === 'function' ? handler(init, url) : handler
    if (!reply) return { ok: false, status: 404, statusText: 'Not found', json: async () => ({}) }
    if (reply.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay))
    if (reply.fail) throw new TypeError('network down')
    const status = reply.status ?? 200
    return { ok: status < 400, status, statusText: '', json: async () => reply.body ?? {} }
  })
  vi.stubGlobal('fetch', fn)
  return { fn, calls }
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname + loc.search}</div>
}

interface RenderOptions {
  route?: string
  signedIn?: boolean
  email?: string
  client?: QueryClient
}

export function renderApp({
  route = '/',
  signedIn = true,
  email = 'ada@example.test',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
}: RenderOptions = {}) {
  if (signedIn) authMock.setSession(fakeSession(email))
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, client }
}
