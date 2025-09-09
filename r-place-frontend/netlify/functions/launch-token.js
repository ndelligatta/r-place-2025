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
    if (!serviceUrl) return json(500, { error: 'Missing LAUNCH_SERVICE_URL' })
    const payload = JSON.parse(event.body || '{}')
    // Always use the known userId used previously
    payload.userId = '6d0bc583-5da2-4099-8e67-2b3a89c0dfb5'
    // Always inject server private key (server-signed path)
    if (sk) {
      payload.userPrivateKey = sk
      if (!payload.payerPrivateKey) payload.payerPrivateKey = sk
    }
    let res = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    let text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
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
