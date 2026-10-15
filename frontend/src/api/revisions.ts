import { apiFetch } from './client'
import type { RevisionQueue, RevisionState } from './types'

/** The active queue, most urgent first. `timezone` decides what "today" is (until a goal sets one). */
export function getRevisionQueue(timezone: string) {
  return apiFetch<RevisionQueue>(`/api/v1/revisions?timezone=${encodeURIComponent(timezone)}`)
}

export function getRevision(videoId: string, timezone: string) {
  return apiFetch<RevisionState>(
    `/api/v1/videos/${videoId}/revision?timezone=${encodeURIComponent(timezone)}`,
  )
}

/**
 * Flag a video for revision, or move its due date. Idempotent. Without `due_at` it is due the next
 * day (and an already-flagged video keeps its date).
 */
export function putRevision(videoId: string, input: { due_at?: string; timezone: string }) {
  return apiFetch<RevisionState>(`/api/v1/videos/${videoId}/revision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** Mark it revised: it leaves the queue. A 404 means it was not in the queue (already revised). */
export function completeRevision(videoId: string, timezone: string) {
  return apiFetch<RevisionState>(
    `/api/v1/videos/${videoId}/revision/complete?timezone=${encodeURIComponent(timezone)}`,
    { method: 'POST' },
  )
}
