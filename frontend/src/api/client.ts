/** Typed REST client. All backend calls go through here, never scattered fetch() calls. */

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** The `details` array from the backend's error envelope (e.g. the current note on a 409). */
    public readonly details: unknown[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface AuthHooks {
  /** Current access token, or null when signed out. */
  getToken: () => Promise<string | null>
  /** Force a token refresh (used once after a 401); returns the new token or null. */
  refreshToken: () => Promise<string | null>
  /** Called when the session is definitively invalid. */
  onUnauthorized: () => void
}

let hooks: AuthHooks | null = null

export function configureApiAuth(next: AuthHooks | null): void {
  hooks = next
}

function send(path: string, init: RequestInit | undefined, token: string | null) {
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let token = hooks ? await hooks.getToken() : null
  let res = await send(path, init, token)

  // 401: refresh the token and retry once, then give up and sign the user out.
  if (res.status === 401 && hooks) {
    token = await hooks.refreshToken()
    if (token) res = await send(path, init, token)
    if (!token || res.status === 401) hooks.onUnauthorized()
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown[] }
    } | null
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? res.statusText,
      body?.error?.details ?? [],
    )
  }
  return (await res.json()) as T
}
