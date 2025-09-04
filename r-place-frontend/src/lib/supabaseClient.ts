// Placeholder: wire real keys in .env and pass into Supabase client.
// import { createClient } from '@supabase/supabase-js'

export function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anon) return null
  // return createClient(url, anon)
  return null
}

