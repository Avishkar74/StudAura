import { apiFetch } from './client'
import type { DashboardLearning } from './types'

export function getDashboardLearning(limit = 6) {
  return apiFetch<DashboardLearning>(`/api/v1/dashboard?limit=${limit}`)
}
