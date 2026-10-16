import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addComment, deleteComment, listComments } from '@/api/comments'
import type { VideoComment } from '@/api/types'

const key = (videoId: string) => ['comments', videoId] as const

export function useComments(videoId: string) {
  return useQuery({
    queryKey: key(videoId),
    queryFn: () => listComments(videoId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

/** Optimistic comments carry this id prefix until the server has stored them. */
export const PENDING_PREFIX = 'pending-'

export function isPending(comment: VideoComment): boolean {
  return comment.id.startsWith(PENDING_PREFIX)
}

export function useAddComment(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { body: string; timestamp_seconds: number | null }) =>
      addComment(videoId, input),
    // The server can be seconds away, so the comment appears at once and is confirmed after.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key(videoId) })
      const previous = qc.getQueryData<VideoComment[]>(key(videoId))
      const pending: VideoComment = {
        id: `${PENDING_PREFIX}${Date.now()}`,
        video_id: videoId,
        body: input.body,
        timestamp_seconds: input.timestamp_seconds,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<VideoComment[]>(key(videoId), (old) => [pending, ...(old ?? [])])
      return { previous }
    },
    onError: (_error, _input, context) => {
      qc.setQueryData(key(videoId), context?.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key(videoId) }),
  })
}

export function useDeleteComment(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(videoId) }),
  })
}
