import { useQuery } from '@tanstack/react-query'
import { getPath, listPathVideos } from '@/api/paths'
import { getVideo } from '@/api/videos'

// The workspace decides whether to offer "Resume from 12:30?" from this data, so it must never
// come from a cache that predates the last time the student watched: always fetch, keep nothing.
const FRESH = { staleTime: 0, gcTime: 0, refetchOnMount: 'always' } as const

export function useWorkspacePathVideos(pathId: string) {
  return useQuery({
    queryKey: ['workspace', 'path-videos', pathId],
    queryFn: () => listPathVideos(pathId),
    ...FRESH,
  })
}

export function useWorkspaceVideo(videoId: string) {
  return useQuery({
    queryKey: ['workspace', 'video', videoId],
    queryFn: () => getVideo(videoId),
    ...FRESH,
  })
}

/** Path title and stats for headings and back links. */
export function usePath(pathId: string) {
  return useQuery({
    queryKey: ['learning-paths', 'detail', pathId],
    queryFn: () => getPath(pathId),
  })
}

export function usePathVideos(pathId: string) {
  return useQuery({
    queryKey: ['learning-paths', 'videos', pathId],
    queryFn: () => listPathVideos(pathId),
  })
}
