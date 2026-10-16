/** Typed REST client. All backend calls go through here, never scattered fetch() calls. */

/**
 * Where the API lives. Request paths already start with /api/v1, so the base is the origin only:
 * empty (the default) means the page's own origin, which is right behind a reverse proxy or
 * Ingress that routes /api to the backend. Set an absolute origin (http://localhost:8000) when the
 * API is served from elsewhere. A trailing slash is ignored.
 */
export function resolveApiBase(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

export const API_BASE_URL: string = resolveApiBase(import.meta.env.VITE_API_BASE_URL)

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
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
