import { apiFetch } from './client'
import type { VideoImportResult } from './types'

export function importVideo(input: { youtube_url: string; learning_path_id: string }) {
  return apiFetch<VideoImportResult>('/api/v1/videos/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
