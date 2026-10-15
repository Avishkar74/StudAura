import { apiFetch } from './client'
import type { Goal, PathDeadline } from './types'

/** `timezone` says which day to count before a goal exists; a saved goal keeps its own. */
export function getGoal(timezone: string) {
  return apiFetch<Goal>(`/api/v1/goals?timezone=${encodeURIComponent(timezone)}`)
}

export function putGoal(input: { daily_target_minutes: number; timezone: string }) {
  return apiFetch<Goal>('/api/v1/goals', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export interface ViewingSessionPing {
  video_id: string
  /** When this viewing began (ISO 8601 with a timezone). Stays the same for the whole viewing. */
  started_at: string
  /** Running total of seconds the video was actually playing in this viewing. */
  watched_seconds: number
}

/** Idempotent: the total is absolute, so repeating or reordering pings cannot double count. */
export function postViewingSession(body: ViewingSessionPing, opts: { keepalive?: boolean } = {}) {
  return apiFetch<{ watched_seconds: number }>('/api/v1/viewing-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: opts.keepalive,
  })
}

/** Paths with a target date and videos still to complete, soonest first. */
export function getDeadlines(timezone: string) {
  return apiFetch<PathDeadline[]>(
    `/api/v1/goals/deadlines?timezone=${encodeURIComponent(timezone)}`,
  )
}
