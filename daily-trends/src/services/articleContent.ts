const CONTENT_CACHE_KEY = 'dailyTrends.fullArticleContent.v4'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function readCache(): Record<string, string> {
  const raw = localStorage.getItem(CONTENT_CACHE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, string>): void {
  localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(cache))
}

function decodeHtml(value: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(value, 'text/html')
  return doc.documentElement.textContent ?? value
}

function countUrls(value: string): number {
  return (value.match(/https?:\/\/[^\s]+/gi) ?? []).length
}

function isReferenceLine(value: string): boolean {
  return /^\[[^\]]+\]:\s*https?:\/\/\S+/i.test(value)
}

function hasEnoughWords(value: string): boolean {
  return (value.match(/[A-Za-z]{3,}/g) ?? []).length >= 3
}

function stripAllLinks(value: string): string {
  const text = decodeHtml(value)
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+)/gi
  let output = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    output += escapeHtml(text.slice(lastIndex, start))

    if (match[2] && match[3]) {
      output += escapeHtml(match[2])
    } else if (match[4]) {
      let rawUrl = match[4]
      const trailing = rawUrl.match(/[.,!?);:]+$/)
      if (trailing) {
        rawUrl = rawUrl.slice(0, -trailing[0].length)
      }
      void rawUrl
      if (trailing) output += escapeHtml(trailing[0])
    }

    lastIndex = pattern.lastIndex
  }

  output += escapeHtml(text.slice(lastIndex))
  return output
}

function trimAfterLearnMore(value: string): string {
  const patterns = [
    /\blearn more\b/i,
    /\bfor more information\b/i,
    /\bread more\b/i,
    /\bsource(s)?\b\s*:/i,
  ]

  let cutIndex = -1
  for (const pattern of patterns) {
    const match = pattern.exec(value)
    if (!match) continue
    if (cutIndex === -1 || match.index < cutIndex) {
      cutIndex = match.index
    }
  }

  return cutIndex === -1 ? value : value.slice(0, cutIndex).trim()
}

function stripStarWrappedContent(value: string): string {
  // Remove ANY content between two '*' characters, including the stars.
  // Handles patterns like *text*, **text**, ***text*** and repeated star pairs.
  let cleaned = value
  while (/(\*{1,3})[^*]+?\1|\*[^*]*\*/.test(cleaned)) {
    cleaned = cleaned
      .replace(/(\*{1,3})[^*]+?\1/g, ' ')
      .replace(/\*[^*]*\*/g, ' ')
  }
  return cleaned.replace(/\s{2,}/g, ' ').trim()
}

function toReadableHtml(rawText: string): string {
  const lines = rawText
    .split('\n')
    .map((line) => decodeHtml(line.trim()))
    .filter(Boolean)
    .filter((line) => !line.startsWith('URL Source:'))
    .filter((line) => !line.startsWith('Markdown Content:'))
    .filter((line) => !line.startsWith('Title:'))
    .filter((line) => !isReferenceLine(line))
    .filter((line) => !(countUrls(line) >= 2 && line.length < 260))
    .filter((line) => hasEnoughWords(line) || countUrls(line) > 0)

  const body = stripStarWrappedContent(trimAfterLearnMore(lines.join(' ')))
    .replace(/\s+/g, ' ')
    .replace(/\s+[|·]\s+/g, '. ')
    .trim()

  if (!body) {
    return '<p>No readable article content available.</p>'
  }

  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean)
  const chunks: string[] = []
  for (let i = 0; i < sentences.length; i += 3) {
    const chunk = sentences.slice(i, i + 3).join(' ')
    chunks.push(`<p>${stripAllLinks(chunk)}</p>`)
  }
  return chunks.join('')
}

export async function fetchReadableArticleHtml(articleUrl: string): Promise<string> {
  const cache = readCache()
  if (cache[articleUrl]) return cache[articleUrl]

  const endpoint = `https://r.jina.ai/http://${articleUrl.replace(/^https?:\/\//, '')}`
  const response = await fetch(endpoint)
  if (!response.ok) {
    throw new Error(`Readable extraction failed (${response.status})`)
  }

  const text = await response.text()
  const html = toReadableHtml(text)
  const nextCache = { ...cache, [articleUrl]: html }
  writeCache(nextCache)
  return html
}
