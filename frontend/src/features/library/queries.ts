import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSaved, listSaved, saveVideo, unsaveVideo, type SavedSort } from '@/api/library'
import type { LearningStatus } from '@/api/types'

export const libraryKeys = {
  all: ['library'] as const,
  list: (status: LearningStatus | undefined, sort: SavedSort) =>
    ['library', 'list', status ?? 'ALL', sort] as const,
  video: (videoId: string) => ['library', 'video', videoId] as const,
}

export function useSavedList(status: LearningStatus | undefined, sort: SavedSort) {
  return useQuery({
    queryKey: libraryKeys.list(status, sort),
    queryFn: () => listSaved({ status, sort }),
    staleTime: 0,
  })
}

/** Whether one video is bookmarked. Never served from cache: the button shows it as fact. */
export function useVideoSaved(videoId: string) {
  return useQuery({
    queryKey: libraryKeys.video(videoId),
    queryFn: () => getSaved(videoId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

/** Bookmark or un-bookmark a video; the saved list is stale afterwards. */
export function useSetSaved(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saved: boolean) => {
      if (saved) return saveVideo(videoId)
      await unsaveVideo(videoId)
      return { video_id: videoId, saved: false, saved_at: null }
    },
    onSuccess: (state) => {
      qc.setQueryData(libraryKeys.video(videoId), state)
      void qc.invalidateQueries({ queryKey: [...libraryKeys.all, 'list'] })
    },
  })
}
