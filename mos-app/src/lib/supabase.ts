import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see mos-app/.env.example)')
}

// Reads resolve against the `shared`-exposed PostgREST (config.toml api.schemas). RLS scopes every
// read to the JWT org/person claims — the client never sends org_id (playbook §8, ADR-0002 D2).
export const supabase = createClient(url, anonKey, {
  db: { schema: 'shared' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
