import { apiFetch } from './client'
import type { LearningPath, Page, PathSort, PathVideo } from './types'

const BASE = '/api/v1/learning-paths'

export function listPaths(params: { sort?: PathSort; q?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.sort) search.set('sort', params.sort)
  if (params.q) search.set('q', params.q)
  if (params.limit) search.set('limit', String(params.limit))
  const qs = search.toString()
  return apiFetch<Page<LearningPath>>(qs ? `${BASE}?${qs}` : BASE)
}

export interface CreatePathInput {
  title: string
  description?: string
  target_date?: string
}

export function createPath(input: CreatePathInput) {
  return apiFetch<LearningPath>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export interface UpdatePathInput {
  title?: string
  /** null clears it */
  description?: string | null
  /** YYYY-MM-DD, or null to clear */
  target_date?: string | null
}

export function updatePath(pathId: string, input: UpdatePathInput) {
  return apiFetch<LearningPath>(`${BASE}/${pathId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** Removes the path and its video list. Notes, progress and saved videos are kept. */
export function deletePath(pathId: string) {
  return apiFetch<void>(`${BASE}/${pathId}`, { method: 'DELETE' })
}

export function getPath(pathId: string) {
  return apiFetch<LearningPath>(`${BASE}/${pathId}`)
}

export function listPathVideos(pathId: string) {
  return apiFetch<Page<PathVideo>>(`${BASE}/${pathId}/videos?limit=500`)
}
