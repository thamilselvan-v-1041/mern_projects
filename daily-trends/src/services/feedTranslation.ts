import type { Feed } from '../types'

const SARVAM_BASE = 'https://api.sarvam.ai'
const CHAT_COMPLETIONS_PATH = '/v1/chat/completions'
const FEED_TRANSLATION_CACHE_KEY = 'dailyTrends.feedTranslation.v2'
const TRANSLATION_BATCH_LIMIT = 15

export interface FeedTranslationItem {
  title: string
  excerpt: string
}

type FeedTranslationMap = Record<string, FeedTranslationItem>

function readCache(): FeedTranslationMap {
  const raw = localStorage.getItem(FEED_TRANSLATION_CACHE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as FeedTranslationMap
  } catch {
    return {}
  }
}

function writeCache(cache: FeedTranslationMap): void {
  localStorage.setItem(FEED_TRANSLATION_CACHE_KEY, JSON.stringify(cache))
}

function normalizeSingleLine(value: string, fallback: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  const base = clean || fallback
  if (base.length <= maxChars) return base
  return `${base.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}

function extractAssistantContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0] as { message?: { content?: unknown } }
  const content = first?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

function parseBatchPayload(text: string): Array<{ id: string; title: string; excerpt: string }> {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Translation response is not valid JSON')
  const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown }
  if (!Array.isArray(parsed.items)) throw new Error('Translation response has no items array')

  return parsed.items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as { id?: unknown; title?: unknown; excerpt?: unknown }
      if (typeof row.id !== 'string' || !row.id.trim()) return null
      return {
        id: row.id.trim(),
        title: typeof row.title === 'string' ? row.title : '',
        excerpt: typeof row.excerpt === 'string' ? row.excerpt : '',
      }
    })
    .filter((item): item is { id: string; title: string; excerpt: string } => Boolean(item))
}

export async function translateFeedsBatchToEnglish(feeds: Feed[]): Promise<FeedTranslationMap> {
  const sliced = feeds.slice(0, TRANSLATION_BATCH_LIMIT)
  if (sliced.length === 0) return {}

  const cache = readCache()
  const fromCache: FeedTranslationMap = {}
  const pending = sliced.filter((feed) => {
    const cached = cache[feed.id]
    if (!cached) return true
    fromCache[feed.id] = cached
    return false
  })
  if (pending.length === 0) return fromCache

  const apiKey = import.meta.env.VITE_SARVAM_API_KEY
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Sarvam API key missing for feed translation')
  }

  const pendingPayload = pending.map((feed) => ({
    id: feed.id,
    title: feed.title.slice(0, 220),
    excerpt: feed.excerpt.slice(0, 420),
  }))

  const prompt = [
    'Translate each feed item into natural English.',
    'If already English, lightly polish while preserving original meaning.',
    'Do not add facts, bullet points, or markdown.',
    'Return valid JSON only in this exact schema:',
    '{"items":[{"id":"<same id>","title":"...","excerpt":"..."}]}',
    '',
    'Feed items:',
    JSON.stringify(pendingPayload),
  ].join('\n')

  const response = await fetch(`${SARVAM_BASE}${CHAT_COMPLETIONS_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey,
    },
    body: JSON.stringify({
      model: 'sarvam-m',
      temperature: 0.1,
      max_tokens: 1600,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert multilingual editor. Translate feed content accurately and return strict JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) throw new Error(`Sarvam translation request failed (${response.status})`)
  const payload = (await response.json()) as unknown
  const raw = extractAssistantContent(payload)
  if (!raw) throw new Error('Sarvam translation response is empty')

  const translatedRows = parseBatchPayload(raw)
  const translatedById = new Map(translatedRows.map((row) => [row.id, row]))

  const resolved: FeedTranslationMap = { ...fromCache }
  const nextCache = { ...cache }
  for (const feed of pending) {
    const row = translatedById.get(feed.id)
    if (!row) throw new Error(`Sarvam translation missing item for feed ${feed.id}`)
    const item: FeedTranslationItem = {
      title: normalizeSingleLine(row.title, feed.title, 180),
      excerpt: normalizeSingleLine(row.excerpt, feed.excerpt, 260),
    }
    resolved[feed.id] = item
    nextCache[feed.id] = item
  }

  writeCache(nextCache)
  return resolved
}
