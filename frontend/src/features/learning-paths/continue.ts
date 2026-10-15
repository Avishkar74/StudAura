import type { PathVideo } from '@/api/types'

export interface ContinueTarget {
  video: PathVideo
  label: 'Continue Learning' | 'Review Completed Videos'
}

/**
 * Which video "Continue Learning" opens (PRD 6.4):
 *  1. the most recently watched in-progress video,
 *  2. otherwise the first video not yet completed, in path order,
 *  3. otherwise (all done) the first video, to review.
 * Returns null for an empty path.
 */
export function pickContinueTarget(items: PathVideo[]): ContinueTarget | null {
  if (items.length === 0) return null

  const inProgress = items
    .filter((i) => i.learning_status === 'IN_PROGRESS')
    .sort((a, b) => (b.last_watched_at ?? '').localeCompare(a.last_watched_at ?? ''))
  if (inProgress.length > 0) return { video: inProgress[0], label: 'Continue Learning' }

  const unfinished = items.find(
    (i) => i.ever_completed_at === null && i.learning_status !== 'COMPLETED',
  )
  if (unfinished) return { video: unfinished, label: 'Continue Learning' }

  return { video: items[0], label: 'Review Completed Videos' }
}
