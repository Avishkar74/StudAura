import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createPath,
  deletePath,
  listPaths,
  updatePath,
  type CreatePathInput,
  type UpdatePathInput,
} from '@/api/paths'
import type { LearningPath, Page, PathSort } from '@/api/types'
import { importVideo } from '@/api/videos'
import { dashboardKeys } from '@/features/dashboard/queries'
import { goalKeys } from '@/features/goals/queries'

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

type PathPage = Page<LearningPath>

/**
 * Update every cached list of paths at once. The server is slow to answer from far away, so the
 * sidebar and cards change immediately; a background refetch then confirms the real state.
 */
function patchLists(qc: QueryClient, change: (items: LearningPath[]) => LearningPath[]) {
  const isList = (key: readonly unknown[]) => key[1] === 'list' || key[1] === 'page'
  qc.setQueriesData<PathPage>({ predicate: (q) => isList(q.queryKey) }, (page) => {
    if (!page || !Array.isArray(page.items)) return page
    const items = change(page.items)
    return { ...page, items, total: Math.max(0, page.total + items.length - page.items.length) }
  })
}

function refreshInBackground(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: pathKeys.all })
  void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  void qc.invalidateQueries({ queryKey: goalKeys.all })
}

export function useCreatePath() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePathInput) => createPath(input),
    onSuccess: (path) => {
      // Only the sidebar list ("recent") gets the new path now; filtered or sorted lists refetch.
      qc.setQueryData<PathPage>(pathKeys.list('recent'), (page) =>
        page ? { ...page, items: [path, ...page.items], total: page.total + 1 } : page,
      )
      qc.setQueryData(['learning-paths', 'detail', path.id], path)
      refreshInBackground(qc)
    },
  })
}

export function useUpdatePath(pathId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePathInput) => updatePath(pathId, input),
    onSuccess: (path) => {
      patchLists(qc, (items) => items.map((p) => (p.id === path.id ? path : p)))
      qc.setQueryData(['learning-paths', 'detail', pathId], path)
      refreshInBackground(qc)
    },
  })
}

export function useDeletePath() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pathId: string) => deletePath(pathId),
    onSuccess: (_void, pathId) => {
      patchLists(qc, (items) => items.filter((p) => p.id !== pathId))
      qc.removeQueries({ queryKey: ['learning-paths', 'detail', pathId] })
      qc.removeQueries({ queryKey: ['learning-paths', 'videos', pathId] })
      refreshInBackground(qc)
    },
  })
}

export function useImportVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: importVideo,
    onSuccess: () => qc.invalidateQueries({ queryKey: pathKeys.all }),
  })
}
