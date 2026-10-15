import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { configureApiAuth } from '@/api/client'
import { supabase } from '@/app/supabase'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'

/** Turn Supabase errors into messages that say what to do, without leaking account details. */
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Please wait a bit and try again.'
  if (m.includes('password')) return message
  return 'Something went wrong. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const queryClient = useQueryClient()
  const lastUserId = useRef<string | null>(null)

  // Cached server data belongs to one user. Drop it whenever the signed-in user changes or
  // signs out, so the next person never sees the previous person's paths or notes.
  const trackUser = useCallback(
    (next: Session | null) => {
      const id = next?.user.id ?? null
      if (id !== lastUserId.current) {
        if (lastUserId.current !== null) queryClient.clear()
        lastUserId.current = id
      }
    },
    [queryClient],
  )

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      trackUser(data.session)
      setSession(data.session)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      trackUser(next)
      setSession(next)
      setStatus(next ? 'signedIn' : 'signedOut')
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [trackUser])

  useEffect(() => {
    configureApiAuth({
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      refreshToken: async () =>
        (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
      onUnauthorized: () => void supabase.auth.signOut(),
    })
    return () => configureApiAuth(null)
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: friendlyError(error.message) } : {}
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: displayName ? { display_name: displayName } : undefined },
    })
    if (error) return { error: friendlyError(error.message) }
    // No session means email confirmation is required. An already-registered address also lands
    // here (Supabase hides that on purpose), so both cases show the same message.
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, user: session?.user ?? null, signIn, signUp, signOut }),
    [status, session, signIn, signUp, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
