import { categories } from '../data/mockData'
import type { Category, Feed } from '../types'
import { cacheFeeds } from '../utils/feedCache'

interface GdeltArticle {
  url?: string
  url_mobile?: string
  title?: string
  seendate?: string
  socialimage?: string
  domain?: string
  language?: string
  sourcecountry?: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'

const CATEGORY_QUERY: Record<string, string> = {
  business: 'business markets economy startups',
  social: 'social media digital culture online communities',
  ai: 'artificial intelligence machine learning llm',
  robotics: 'robotics automation humanoid robots',
  beauty: 'beauty skincare cosmetics wellness',
  tech: 'technology gadgets software cybersecurity',
  health: 'health medicine healthcare public health',
  science: 'science research discoveries',
  entertainment: 'entertainment movies music streaming',
  sports: 'sports cricket football olympics',
  finance: 'finance stock market investment banking',
  fashion: 'fashion trends designers apparel',
  travel: 'travel tourism airlines destinations',
  food: 'food restaurants recipes culinary',
  environment: 'climate environment sustainability renewable energy',
}

function toFeedId(link: string, categoryId: string): string {
  let hash = 0
  const key = `${categoryId}:${link}`
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return `rss-${categoryId}-${Math.abs(hash)}`
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizePublishedAt(value?: string): string {
  if (!value) return new Date().toISOString()

  // GDELT often uses compact UTC format: YYYYMMDDTHHMMSSZ
  const compactMatch = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  )
  if (compactMatch) {
    const [, y, m, d, hh, mm, ss] = compactMatch
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString()
  return date.toISOString()
}

function toPreviewContent(title: string): string {
  const safe = stripHtml(title)
  return `<p>${safe}</p><p>Loading full article content...</p>`
}

function getBannerColors(slug: string): { top: string; bottom: string } {
  const palette: Record<string, { top: string; bottom: string }> = {
    business: { top: '#0f766e', bottom: '#115e59' },
    social: { top: '#2563eb', bottom: '#1d4ed8' },
    ai: { top: '#7c3aed', bottom: '#6d28d9' },
    robotics: { top: '#334155', bottom: '#1e293b' },
    beauty: { top: '#db2777', bottom: '#be185d' },
    tech: { top: '#0891b2', bottom: '#0e7490' },
    health: { top: '#16a34a', bottom: '#15803d' },
    science: { top: '#4f46e5', bottom: '#4338ca' },
    entertainment: { top: '#d97706', bottom: '#b45309' },
    sports: { top: '#ea580c', bottom: '#c2410c' },
    finance: { top: '#059669', bottom: '#047857' },
    fashion: { top: '#9333ea', bottom: '#7e22ce' },
    travel: { top: '#0284c7', bottom: '#0369a1' },
    food: { top: '#dc2626', bottom: '#b91c1c' },
    environment: { top: '#16a34a', bottom: '#166534' },
  }
  return palette[slug] ?? { top: '#2563eb', bottom: '#1d4ed8' }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 3))}...`
}

function capChars(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}

function splitTitleLines(value: string, maxCharsPerLine = 28, maxLines = 8): string[] {
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxCharsPerLine) {
      current = next
      continue
    }

    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines - 1) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = truncate(lines[maxLines - 1], maxCharsPerLine)
  }

  return lines
}

function toMockBanner(
  category: Category,
  articleTitle: string,
  source: string,
  publishedAt: string
): string {
  const colors = getBannerColors(category.slug)
  const horizontalPadding = 70
  const contentWidth = 1200 - horizontalPadding * 2
  const titleLinesArray = splitTitleLines(capChars(articleTitle, 80))
  const titleStartY = 190
  const titleLineHeight = 56
  const titleBottomY = titleStartY + (titleLinesArray.length - 1) * titleLineHeight + 20
  const bannerHeight = Math.min(980, Math.max(320, titleBottomY + 56))
  const titleClipHeight = bannerHeight - 160
  const publishedDate = new Date(publishedAt)
  const publishedText = Number.isNaN(publishedDate.getTime())
    ? 'Published time unavailable'
    : publishedDate.toLocaleString()
  const sourceValueText = escapeXml(truncate(source || 'Unknown source', 44))
  const timeValueText = escapeXml(publishedText)
  const titleLines = titleLinesArray.map((line, index) => {
    const y = titleStartY + index * titleLineHeight
    return `<text x='70' y='${y}' font-size='48' font-family='-apple-system,Segoe UI,Roboto,Arial' fill='white' font-weight='700'>${escapeXml(line)}</text>`
  }).join('')
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='${bannerHeight}' viewBox='0 0 1200 ${bannerHeight}'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${colors.top}'/>
      <stop offset='100%' stop-color='${colors.bottom}'/>
    </linearGradient>
    <clipPath id='titleClip'>
      <rect x='${horizontalPadding}' y='132' width='${contentWidth}' height='${titleClipHeight}' />
    </clipPath>
  </defs>
  <rect width='1200' height='${bannerHeight}' fill='url(#g)'/>
  <text x='${horizontalPadding}' y='74' font-size='24' font-family='-apple-system,Segoe UI,Roboto,Arial' fill='rgba(255,255,255,0.95)'>Source: <tspan font-weight='600'>${sourceValueText}</tspan></text>
  <text x='${horizontalPadding}' y='110' font-size='22' font-family='-apple-system,Segoe UI,Roboto,Arial' fill='rgba(255,255,255,0.92)'>Published: <tspan font-weight='600'>${timeValueText}</tspan></text>
  <g clip-path='url(#titleClip)'>${titleLines}</g>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function buildBannerForFeed(feed: Feed, titleOverride?: string): string {
  const category = categories.find((entry) => entry.id === feed.categoryId)
  if (!category) return feed.imageUrl || ''

  return toMockBanner(
    category,
    titleOverride || feed.title,
    feed.source,
    feed.publishedAt
  )
}

async function fetchGdeltArticles(queryValue: string, limit: number): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query: queryValue,
    mode: 'ArtList',
    format: 'json',
    sort: 'HybridRel',
    maxrecords: String(Math.max(limit, 10)),
    timespan: '7days',
  })
  const url = `${GDELT_BASE}?${params.toString()}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GDELT request failed (${response.status})`)

  const rawText = await response.text()
  try {
    const data = JSON.parse(rawText) as GdeltResponse
    return data.articles ?? []
  } catch {
    const message = rawText.slice(0, 120).trim() || 'Unexpected GDELT response'
    throw new Error(message)
  }
}

function mapArticlesToFeeds(articles: GdeltArticle[], category: Category, limit: number): Feed[] {
  return articles
    .slice(0, limit)
    .map((item): Feed | null => {
      const title = item.title?.trim()
      const link = (item.url || item.url_mobile || '').trim()
      if (!title || !link) return null

      const source = item.domain || item.sourcecountry || 'GDELT'
      const publishedAt = normalizePublishedAt(item.seendate)
      const excerpt = `${title}. Open this article to load full readable content.`
      return {
        id: toFeedId(link, category.id),
        categoryId: category.id,
        title,
        excerpt: excerpt.length > 180 ? `${excerpt.slice(0, 180)}...` : excerpt,
        content: toPreviewContent(title),
        imageUrl: toMockBanner(category, title, source, publishedAt),
        publishedAt,
        source,
        link,
      }
    })
    .filter((feed): feed is Feed => Boolean(feed))
}

async function fetchCategoryFromGdelt(category: Category, limit: number): Promise<Feed[]> {
  const topic = CATEGORY_QUERY[category.slug] ?? category.name
  let articles: GdeltArticle[] = []
  const attempts = [topic, category.name, `${category.name} news`]

  for (const query of attempts) {
    try {
      const result = await fetchGdeltArticles(query, limit)
      if (result.length > 0) {
        articles = result
        break
      }
    } catch {
      // Try next fallback query.
    }
  }

  const feeds = mapArticlesToFeeds(articles, category, limit)

  cacheFeeds(feeds)
  return feeds
}

function dedupeFeeds(feeds: Feed[]): Feed[] {
  const seen = new Set<string>()
  const deduped: Feed[] = []
  for (const feed of feeds) {
    const key = feed.link || feed.title
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(feed)
  }
  return deduped
}

export async function fetchFeedsForCategory(categoryId: string, limit = 10): Promise<Feed[]> {
  const category = categories.find((entry) => entry.id === categoryId)
  if (!category) return []

  return fetchCategoryFromGdelt(category, limit)
}

export async function fetchTopFeedsForSelectedCategories(categoryIds: string[], limit = 10): Promise<Feed[]> {
  const selected = categories.filter((category) => categoryIds.includes(category.id))
  if (selected.length === 0) return []

  const result = await Promise.allSettled(
    selected.map((category) => fetchCategoryFromGdelt(category, Math.max(5, limit)))
  )

  const merged = result.flatMap((entry) => (entry.status === 'fulfilled' ? entry.value : []))
  const deduped = dedupeFeeds(merged)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit)

  if (deduped.length > 0) return deduped

  // Global fallback so home is never empty when category queries are sparse.
  const primaryCategory = selected[0]
  const globalArticles = await fetchGdeltArticles('breaking news world technology business sports', limit)
  const fallbackFeeds = mapArticlesToFeeds(globalArticles, primaryCategory, limit)
  cacheFeeds(fallbackFeeds)
  return fallbackFeeds
}
