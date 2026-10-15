import { useQuery } from '@tanstack/react-query'
import { getDashboardLearning } from '@/api/dashboard'

export const dashboardKeys = { all: ['dashboard'] as const }

/** Where to pick up: the video to continue and the latest watched. Fresh on every visit. */
export function useDashboardLearning() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: () => getDashboardLearning(6),
    staleTime: 0,
  })
}
