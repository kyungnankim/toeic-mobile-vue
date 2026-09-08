const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

let cachedJson = null

module.exports = async function handler(req, res) {
  try {
    if (!cachedJson) {
      const filePath = path.join(process.cwd(), 'data', 'lc-sentences-400.gz.b64')
      const b64 = fs.readFileSync(filePath, 'utf8').trim()
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
    return res.status(500).json({ error: 'LC400 data load failed', detail: String(error && error.message || error) })
  }
}
