import { apiFetch } from './client'

/** `/health` and `/ready` sit at the server root, outside /api/v1. */
export function getHealth(): Promise<{ status: string }> {
  return apiFetch('/health')
}
