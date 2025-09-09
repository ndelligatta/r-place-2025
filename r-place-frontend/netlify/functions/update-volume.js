const fetch = require('node-fetch')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async function () {
  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
    const MINT = process.env.MINT_ADDRESS
    const ST_KEY = process.env.SOLANATRACKER_API_KEY || 'fe0334b7-529a-4711-91a0-77764b1b5af7'
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !MINT) {
      return { statusCode: 500, body: 'Missing environment variables' }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

    const url = `https://data.solanatracker.io/tokens/${encodeURIComponent(MINT)}`
    const res = await fetch(url, { headers: { 'x-api-key': ST_KEY } })
    if (!res.ok) {
      return { statusCode: 502, body: `SolanaTracker error: ${res.status}` }
    }
    const json = await res.json()
    // Attempt to read total volume from first pool txns.volume, else fallback to 24h
    const pools = json && json.pools
    const volRaw = (Array.isArray(pools) && pools[0] && (pools[0].txns && (pools[0].txns.volume || pools[0].txns.volume24h))) || 0
    const volume = Number(volRaw) || 0
    const fees = volume * 0.018

    await supabase.from('total_volume').insert({ volume, fees })

    return { statusCode: 200, body: JSON.stringify({ ok: true, volume, fees }) }
  } catch (e) {
    return { statusCode: 500, body: String(e && (e.message || e)) }
  }
}

