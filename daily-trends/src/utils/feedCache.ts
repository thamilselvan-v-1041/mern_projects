import type { Feed } from '../types'

const FEED_CACHE_KEY = 'dailyTrends.feedCache'
const MAX_CACHE_ITEMS = 300

function readCache(): Record<string, Feed> {
  const raw = localStorage.getItem(FEED_CACHE_KEY)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, Feed>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, Feed>): void {
  const entries = Object.entries(cache)
    .sort(([, a], [, b]) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_CACHE_ITEMS)

  localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
}

export function cacheFeeds(feeds: Feed[]): void {
  if (feeds.length === 0) return

  const current = readCache()
  const next: Record<string, Feed> = { ...current }
  feeds.forEach((feed) => {
    next[feed.id] = feed
  })
  writeCache(next)
}

export function getCachedFeedById(feedId: string): Feed | undefined {
  return readCache()[feedId]
}

export function getCachedFeedsByIds(feedIds: string[]): Feed[] {
  const cache = readCache()
  return feedIds.map((id) => cache[id]).filter((feed): feed is Feed => Boolean(feed))
}
