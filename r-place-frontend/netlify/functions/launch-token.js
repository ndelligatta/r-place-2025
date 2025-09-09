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
    const original = JSON.parse(event.body || '{}')
    // Always inject server private key (server-signed path)
    if (sk) {
      original.userPrivateKey = sk
      if (!original.payerPrivateKey) original.payerPrivateKey = sk
    }
    let res = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(original)
    })
    let text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    const msg = (data && (data.error || data.message || '')) + ''
    if (res.status >= 400 && /dev wallet/i.test(msg) && original.userId) {
      const forced = { ...original }
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
