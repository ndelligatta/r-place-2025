import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

export function getSupabase() {
  if (cached !== undefined) return cached
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) {
    cached = null
    return cached
  }
  cached = createClient(url, anon)
  return cached
}
