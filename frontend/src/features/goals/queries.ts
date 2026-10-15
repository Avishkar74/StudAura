import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getGoal, putGoal } from '@/api/goals'

export const goalKeys = { all: ['goals'] as const }

/** The browser's IANA timezone, e.g. "Asia/Kolkata". Defines where "today" starts and ends. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function useGoal() {
  return useQuery({
    queryKey: goalKeys.all,
    queryFn: () => getGoal(browserTimezone()),
  })
}

export function useSaveGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (minutes: number) =>
      putGoal({ daily_target_minutes: minutes, timezone: browserTimezone() }),
    onSuccess: (goal) => qc.setQueryData(goalKeys.all, goal),
  })
}
