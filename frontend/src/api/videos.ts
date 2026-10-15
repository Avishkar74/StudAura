import { apiFetch } from './client'
import type { LearningStatus, ProgressFields, VideoDetail, VideoImportResult } from './types'

export function importVideo(input: { youtube_url: string; learning_path_id: string }) {
  return apiFetch<VideoImportResult>('/api/v1/videos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function getVideo(videoId: string) {
  return apiFetch<VideoDetail>(`/api/v1/videos/${videoId}`)
}

export interface ProgressUpdate {
  last_position_seconds?: number
  learning_status?: LearningStatus
  /** The player reported ENDED; needs a position and `session_seeked`. */
  playback_ended?: boolean
  session_seeked?: boolean
}

/** Idempotent. `keepalive` lets the request finish while the page is closing. */
export function putProgress(
  videoId: string,
  body: ProgressUpdate,
  opts: { keepalive?: boolean } = {},
) {
  return apiFetch<ProgressFields & { video_id: string }>(`/api/v1/videos/${videoId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: opts.keepalive,
  })
}
