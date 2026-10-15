import { apiFetch } from './client'
import type { PlaylistImportPage } from './types'

export interface PlaylistImportInput {
  youtube_url: string
  learning_path_id: string
  page_token?: string
}

export function importPlaylistPage(input: PlaylistImportInput) {
  return apiFetch<PlaylistImportPage>('/api/v1/playlists/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
