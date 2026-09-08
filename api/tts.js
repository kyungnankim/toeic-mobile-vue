module.exports = async function handler(req, res) {
  try {
    const text = String(req.query.text || '').trim().slice(0, 190)
    const lang = String(req.query.lang || 'en-US').toLowerCase().startsWith('ko') ? 'ko-KR' : 'en-US'
    if (!text) return res.status(400).json({ error: 'text is required' })

    const url = new URL('https://translate.googleapis.com/translate_tts')
    url.searchParams.set('client', 'gtx')
    url.searchParams.set('ie', 'UTF-8')
    url.searchParams.set('tl', lang)
    url.searchParams.set('q', text)

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8'
      }
    })

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: 'TTS upstream failed', detail: body.slice(0, 200) })
    }

    const data = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
    res.setHeader('Content-Length', String(data.length))
    return res.status(200).send(data)
  } catch (error) {
    return res.status(500).json({ error: 'TTS proxy error', detail: String(error && error.message || error) })
  }
}
