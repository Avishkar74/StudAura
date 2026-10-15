import { useQuery } from '@tanstack/react-query'
import { getNote } from '@/api/notes'

/**
 * The saved note. Never served from cache: the editor starts from this and compares revisions,
 * so a stale copy could make the student overwrite a newer save from another tab.
 */
export function useNote(videoId: string) {
  return useQuery({
    queryKey: ['notes', videoId],
    queryFn: () => getNote(videoId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
