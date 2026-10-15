import { apiFetch } from './client'
import type { Note } from './types'

export function getNote(videoId: string) {
  return apiFetch<Note>(`/api/v1/videos/${videoId}/notes`)
}

export interface NoteSave {
  body: string
  /** The revision last seen (0 = no note yet). Omit to overwrite unconditionally. */
  base_revision?: number
}

/** Autosave target. Idempotent; a 409 carries the current note in `details[0].current`. */
export function putNote(videoId: string, save: NoteSave, opts: { keepalive?: boolean } = {}) {
  return apiFetch<Note>(`/api/v1/videos/${videoId}/notes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(save),
    keepalive: opts.keepalive,
  })
}
