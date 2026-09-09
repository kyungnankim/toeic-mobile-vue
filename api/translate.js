module.exports = async function handler(req, res) {
  try {
    const text = String(req.query.text || '').trim().slice(0, 900)
    if (!text) return res.status(400).json({ error: 'text is required' })

    const url = new URL('https://translate.googleapis.com/translate_a/single')
    url.searchParams.set('client', 'gtx')
    url.searchParams.set('sl', 'en')
    url.searchParams.set('tl', 'ko')
    url.searchParams.set('dt', 't')
    url.searchParams.set('q', text)

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json,text/plain,*/*'
      }
    })
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'translation upstream failed' })
    const data = await upstream.json()
    const translated = Array.isArray(data?.[0])
      ? data[0].map(x => Array.isArray(x) ? x[0] : '').join('').trim()
      : ''
    if (!translated) return res.status(502).json({ error: 'empty translation' })

    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800')
    return res.status(200).json({ translated })
  } catch (error) {
    return res.status(500).json({ error: 'translation api error', detail: String(error?.message || error) })
  }
}
