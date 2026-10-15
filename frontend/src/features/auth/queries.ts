import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/api/me'

/** The backend's view of the signed-in user (display name, email). */
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 5 * 60_000 })
}
