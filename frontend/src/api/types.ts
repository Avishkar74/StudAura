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

export interface PlaylistImportItem {
  youtube_video_id: string
  status: 'added' | 'skipped' | 'failed'
  title: string | null
  position: number | null
  reason: string | null
  video_id: string | null
  availability_state: string | null
}

/** Result for one page (up to 50 videos). Call again with `next_page_token` until it is null. */
export interface PlaylistImportPage {
  added: number
  skipped: number
  failed: number
  total_in_playlist: number | null
  next_page_token: string | null
  items: PlaylistImportItem[]
}

export type LearningStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_REVISION'

/** The caller's own progress on a video. Position and status are separate fields. */
export interface ProgressFields {
  learning_status: LearningStatus
  last_position_seconds: number
  playback_pct: number | null
  ever_completed_at: string | null
  last_watched_at: string | null
}

/** One row of a path's ordered video list. */
export interface PathVideo extends ProgressFields {
  position: number
  video: VideoMeta
}

/** A single video with the caller's progress (GET /videos/{id}). */
export interface VideoDetail extends ProgressFields {
  video: VideoMeta
}

/** The caller's note for a video. `revision` is 0 (and `body` empty) until one is saved. */
export interface Note {
  video_id: string
  body: string
  revision: number
  updated_at: string | null
}

/** The daily goal and today's tracked viewing time (the day is counted in `timezone`). */
export interface Goal {
  /** Null until a goal has been set. */
  daily_target_minutes: number | null
  timezone: string
  today: string
  today_watched_seconds: number
  goal_achieved: boolean
}

export type DueState = 'overdue' | 'due_today' | 'upcoming'

/** A video's revision state. `active` is false when it is not in the revision queue. */
export interface RevisionState {
  video_id: string
  learning_status: LearningStatus
  active: boolean
  due_at: string | null
  flagged_at: string | null
  /** When it was last marked revised, if ever. */
  revised_at: string | null
  due_state: DueState | null
  /** Today in the student's timezone (YYYY-MM-DD). */
  today: string
}

export interface RevisionItem {
  video_id: string
  video: VideoMeta
  /** One of the student's paths that contains the video, for opening it in context. */
  path: { id: string; title: string } | null
  due_at: string
  flagged_at: string
  due_state: DueState
}

export interface RevisionQueue {
  today: string
  timezone: string
  total: number
  /** Items due today or overdue. */
  due_count: number
  items: RevisionItem[]
}

/** One of the caller's own comments on a video. */
export interface VideoComment {
  id: string
  video_id: string
  body: string
  timestamp_seconds: number | null
  created_at: string
}

export interface VideoImportResult {
  status: 'added' | 'skipped'
  reason: string | null
  position: number
  video: VideoMeta
}
