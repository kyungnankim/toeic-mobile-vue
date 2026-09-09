const BOOKS = {
  gatsby: {
    id: 'gatsby',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    source: 'https://www.gutenberg.org/cache/epub/64317/pg64317.txt',
    chapters: 9
  }
}

function cleanParagraphs(raw) {
  return raw
    .split(/\n\s*\n+/)
    .map(p => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p && !/^[-_]{5,}$/.test(p))
}

function splitChapters(text) {
  const lines = text.replace(/\r/g, '').split('\n')
  const expected = ['I','II','III','IV','V','VI','VII','VIII','IX']
  const starts = []
  let cursor = 50

  for (const label of expected) {
    let found = -1
    for (let i = cursor; i < lines.length; i++) {
      const raw = lines[i]
      if (/^\s{10,}/.test(raw) && raw.trim() === label) {
        found = i
        break
      }
    }
    if (found < 0) break
    starts.push({ i: found, label })
    cursor = found + 1
  }

  return starts.map((s, idx) => {
    let end = starts[idx + 1]?.i
    if (!end) {
      const footer = lines.findIndex((l, j) => j > s.i && l.includes('*** END OF THE PROJECT GUTENBERG EBOOK'))
      end = footer > s.i ? footer : lines.length
    }
    const body = lines.slice(s.i + 1, end).join('\n')
    return { number: idx + 1, roman: s.label, paragraphs: cleanParagraphs(body) }
  })
}

module.exports = async function handler(req, res) {
  try {
    const bookId = String(req.query.book || 'gatsby').toLowerCase()
    const book = BOOKS[bookId]
    if (!book) return res.status(404).json({ error: 'book not found' })
    const chapterNo = Math.max(1, Math.min(book.chapters, Number(req.query.chapter || 1)))

    const upstream = await fetch(book.source, {
      headers: { 'User-Agent': 'Mozilla/5.0 TOEIC-EBOOK/1.0' }
    })
    if (!upstream.ok) return res.status(502).json({ error: 'book source unavailable' })
    const text = await upstream.text()
    const chapters = splitChapters(text)
    const chapter = chapters[chapterNo - 1]
    if (!chapter) return res.status(500).json({ error: 'chapter parse failed' })

    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400')
    return res.status(200).json({
      book: { id: book.id, title: book.title, author: book.author, chapters: book.chapters },
      chapter: chapter.number,
      roman: chapter.roman,
      paragraphs: chapter.paragraphs,
      source: 'Project Gutenberg eBook #64317'
    })
  } catch (error) {
    return res.status(500).json({ error: 'ebook api error', detail: String(error?.message || error) })
  }
}
