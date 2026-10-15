import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addComment, deleteComment, listComments } from '@/api/comments'

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

export function useAddComment(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { body: string; timestamp_seconds: number | null }) =>
      addComment(videoId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(videoId) }),
  })
}

export function useDeleteComment(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(videoId) }),
  })
}
