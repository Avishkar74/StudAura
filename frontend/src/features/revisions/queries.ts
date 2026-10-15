import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { completeRevision, getRevision, getRevisionQueue, putRevision } from '@/api/revisions'
import type { RevisionState } from '@/api/types'
import { browserTimezone } from '@/features/goals/queries'
import { pathKeys } from '@/features/learning-paths/queries'

export const revisionKeys = {
  all: ['revisions'] as const,
  queue: ['revisions', 'queue'] as const,
  video: (videoId: string) => ['revisions', 'video', videoId] as const,
}

/** The whole queue (dashboard, and later the Needs Revision page). */
export function useRevisionQueue() {
  return useQuery({
    queryKey: revisionKeys.queue,
    queryFn: () => getRevisionQueue(browserTimezone()),
  })
}

/** One video's revision state. Never served from cache: the workspace shows it as fact. */
export function useVideoRevision(videoId: string) {
  return useQuery({
    queryKey: revisionKeys.video(videoId),
    queryFn: () => getRevision(videoId, browserTimezone()),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

/** After any change: this video's state is known, and everything that lists revisions or counts
 *  statuses (queue, dashboard, path progress) is stale. */
function useAfterChange(videoId: string) {
  const qc = useQueryClient()
  return (state: RevisionState) => {
    qc.setQueryData(revisionKeys.video(videoId), state)
    void qc.invalidateQueries({ queryKey: revisionKeys.queue })
    void qc.invalidateQueries({ queryKey: pathKeys.all })
  }
}

/** Flag for revision (no date: due tomorrow), or move the due date (with one). */
export function useFlagRevision(videoId: string) {
  const after = useAfterChange(videoId)
  return useMutation({
    mutationFn: (dueAt?: string) =>
      putRevision(videoId, { due_at: dueAt, timezone: browserTimezone() }),
    onSuccess: after,
  })
}

export function useCompleteRevision(videoId: string) {
  const after = useAfterChange(videoId)
  return useMutation({
    mutationFn: () => completeRevision(videoId, browserTimezone()),
    onSuccess: after,
  })
}
