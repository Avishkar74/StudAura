import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPath, listPaths, type CreatePathInput } from '@/api/paths'
import type { PathSort } from '@/api/types'
import { importVideo } from '@/api/videos'

export const pathKeys = {
  all: ['learning-paths'] as const,
  list: (sort: string) => ['learning-paths', 'list', sort] as const,
}

/** The user's paths, most recently active first. Feeds the sidebar and the dashboard. */
export function useLearningPaths() {
  return useQuery({
    queryKey: pathKeys.list('recent'),
    queryFn: () => listPaths({ sort: 'recent', limit: 100 }),
  })
}

/** The paths page: every path, sorted, optionally filtered by title. */
export function usePathList(sort: PathSort, q: string) {
  return useQuery({
    queryKey: ['learning-paths', 'page', sort, q],
    queryFn: () => listPaths({ sort, q: q || undefined, limit: 100 }),
  })
}

export function useCreatePath() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePathInput) => createPath(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: pathKeys.all }),
  })
}

export function useImportVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importVideo,
    onSuccess: () => qc.invalidateQueries({ queryKey: pathKeys.all }),
  })
}
