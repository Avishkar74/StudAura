import { apiFetch } from './client'
import type { LearningStatus, NoteListItem, Page, SavedItem, SavedState } from './types'

export function listNotes(params: { q?: string; pathId?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.pathId) search.set('path_id', params.pathId)
  search.set('limit', String(params.limit ?? 100))
  return apiFetch<Page<NoteListItem>>(`/api/v1/notes?${search}`)
}

export type SavedSort = 'saved' | 'watched'

export function listSaved(params: { status?: LearningStatus; sort?: SavedSort } = {}) {
  const search = new URLSearchParams()
  if (params.status) search.set('status', params.status)
  if (params.sort) search.set('sort', params.sort)
  search.set('limit', '100')
  return apiFetch<Page<SavedItem>>(`/api/v1/saved-videos?${search}`)
}

export function getSaved(videoId: string) {
  return apiFetch<SavedState>(`/api/v1/videos/${videoId}/saved`)
}

/** Idempotent. */
export function saveVideo(videoId: string) {
  return apiFetch<SavedState>(`/api/v1/videos/${videoId}/saved`, { method: 'PUT' })
}

/** Idempotent. Removes the bookmark only. */
export function unsaveVideo(videoId: string) {
  return apiFetch<void>(`/api/v1/videos/${videoId}/saved`, { method: 'DELETE' })
}
