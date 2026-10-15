import { apiFetch } from './client'
import type { VideoComment } from './types'

export function listComments(videoId: string) {
  return apiFetch<VideoComment[]>(`/api/v1/videos/${videoId}/comments`)
}

export function addComment(
  videoId: string,
  comment: { body: string; timestamp_seconds?: number | null },
) {
  return apiFetch<VideoComment>(`/api/v1/videos/${videoId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  })
}

export function deleteComment(commentId: string) {
  return apiFetch<void>(`/api/v1/comments/${commentId}`, { method: 'DELETE' })
}
