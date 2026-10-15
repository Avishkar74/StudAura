/** Shapes returned by the backend (see backend/app/schemas). */

export interface Page<T> {
  total: number
  limit: number
  offset: number
  items: T[]
}

export interface LearningPath {
  id: string
  title: string
  description: string | null
  target_date: string | null
  created_at: string
  updated_at: string
  total_videos: number
  completed_videos: number
  in_progress_videos: number
  needs_revision_videos: number
  completion_pct: number
  last_activity_at: string | null
}

export type PathSort = 'recent' | 'name' | 'progress' | 'target_date'

export interface VideoMeta {
  id: string
  youtube_video_id: string
  title: string
  channel_title: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  availability_state: 'available' | 'unavailable' | 'embed_disabled'
}

export interface VideoImportResult {
  status: 'added' | 'skipped'
  reason: string | null
  position: number
  video: VideoMeta
}
