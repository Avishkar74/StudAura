import { createClient } from '@supabase/supabase-js'

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// The anon key is public by design. The service-role/secret key must never appear here.
// Placeholders keep the module importable when unconfigured; the app shows a setup notice.
export const supabase = createClient(
  url || 'http://supabase.invalid',
  anonKey || 'missing-anon-key',
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } },
)
