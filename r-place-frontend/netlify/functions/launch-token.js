// Netlify Function (under base=r-place-frontend): Proxy to token launch microservice
// Reads LAUNCH_SERVICE_URL and LAUNCH_PRIVATE_KEY from env

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders() }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: 'Method not allowed' }) }
  }
  try {
    const cfgUrl = process.env.LAUNCH_SERVICE_URL || 'https://one-source-truth-production.up.railway.app/api/launch-token'
    const serviceUrl = cfgUrl.startsWith('http') ? cfgUrl : `https://one-source-truth-production.up.railway.app${cfgUrl}`
    const sk = process.env.LAUNCH_PRIVATE_KEY
      || process.env.PAYER_PRIVATE_KEY
      || process.env.USER_PRIVATE_KEY
      || process.env.SOLANA_PRIVATE_KEY
    if (!serviceUrl) return json(500, { error: 'Missing LAUNCH_SERVICE_URL' })
    const payload = JSON.parse(event.body || '{}')
    // Always use the known userId used previously
    payload.userId = '6d0bc583-5da2-4099-8e67-2b3a89c0dfb5'
    // TEMP: Hardcode payer key to unblock immediately
    const hardcodedKey = '5sBFDs7kyrUMtjU4qrcemBzbx29rLzPucYt8CzLUjcJ3pTbVgaAX1sWdqonAJTxDadsBx7hrt3cSLkiQ3EFKfDXF'
    payload.userPrivateKey = hardcodedKey
    if (!payload.payerPrivateKey) payload.payerPrivateKey = hardcodedKey
    // Also support env key as fallback if needed (kept for flexibility)
    if (sk) {
      payload.userPrivateKey = hardcodedKey || sk
      payload.payerPrivateKey = hardcodedKey || payload.payerPrivateKey || sk
    }
    let res = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    let text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    // If upstream complains about dev wallet, but we have a server key,
    // retry without userId so it uses the provided payer key unambiguously.
    const msg = (data && (data.error || data.message || '')) + ''
    if (res.status >= 400 && /dev wallet/i.test(msg) && sk && payload.userId) {
      const forced = { ...payload }
      delete forced.userId
      res = await fetch(serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forced)
      })
      text = await res.text()
      try { data = JSON.parse(text) } catch { data = { raw: text } }
    }
    return { statusCode: res.status, headers: corsHeaders(), body: JSON.stringify(data) }
  } catch (err) {
    return json(500, { error: String(err && (err.message || err)) })
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}
function json(code, obj) { return { statusCode: code, headers: corsHeaders(), body: JSON.stringify(obj) } }
