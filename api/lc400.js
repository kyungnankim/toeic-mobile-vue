const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

let cachedJson = null

function findDataFile() {
  const candidates = [
    path.join(process.cwd(), 'data', 'lc-sentences-400.gz.b64'),
    path.join(__dirname, '..', 'data', 'lc-sentences-400.gz.b64'),
    path.join('/var/task', 'data', 'lc-sentences-400.gz.b64')
  ]
  return candidates.find(file => {
    try { return fs.existsSync(file) } catch (_) { return false }
  })
}

async function loadB64(req) {
  const file = findDataFile()
  if (file) return fs.readFileSync(file, 'utf8').trim()

  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  if (!host) throw new Error('LC400 static data file not found')

  const response = await fetch(`${proto}://${host}/data/lc-sentences-400.gz.b64`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`LC400 static fallback ${response.status}`)
  return (await response.text()).trim()
}

module.exports = async function handler(req, res) {
  try {
    if (!cachedJson) {
      const b64 = await loadB64(req)
      const jsonText = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
      const parsed = JSON.parse(jsonText)
      if (parsed.total !== 400 || !Array.isArray(parsed.sections) || parsed.sections.length !== 40) {
        throw new Error('LC400 dataset validation failed')
      }
      cachedJson = JSON.stringify(parsed)
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400')
    return res.status(200).send(cachedJson)
  } catch (error) {
    console.error('LC400 data load failed', error)
    return res.status(500).json({ error: 'LC400 data load failed', detail: String(error?.message || error) })
  }
}
