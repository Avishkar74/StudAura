import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

type Listener = (event: string, session: Session | null) => void

export function fakeSession(email = 'ada@example.test'): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1', email } as Session['user'],
  } as Session
}

/** In-memory stand-in for `supabase.auth` that behaves like the real client's session store. */
export function createAuthMock() {
  let session: Session | null = null
  const listeners = new Set<Listener>()
  const set = (next: Session | null) => {
    session = next
    listeners.forEach((l) => l(next ? 'SIGNED_IN' : 'SIGNED_OUT', next))
  }

  return {
    setSession: set,
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((cb: Listener) => {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      }),
      signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
        set(fakeSession(email))
        return { data: { session }, error: null }
      }),
      signUp: vi.fn(async () => ({ data: { session: null, user: {} }, error: null })),
      signOut: vi.fn(async () => {
        set(null)
        return { error: null }
      }),
    },
  }
}
