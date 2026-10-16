import { apiFetch } from './client'

export interface Me {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>('/api/v1/me')
}

export function updateMe(input: { display_name: string | null }): Promise<Me> {
  return apiFetch<Me>('/api/v1/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
