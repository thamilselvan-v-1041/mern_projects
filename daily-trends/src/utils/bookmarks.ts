import type { Feed } from '../types'
import { cacheFeeds, getCachedFeedsByIds } from './feedCache'

const BOOKMARKS_KEY = 'dailyTrends.bookmarks'
export const BOOKMARKS_UPDATED_EVENT = 'dailyTrends:bookmarks-updated'

function readBookmarks(): Feed[] {
  const raw = localStorage.getItem(BOOKMARKS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      if (parsed.every((entry) => typeof entry === 'string')) {
        return getCachedFeedsByIds(parsed as string[])
      }

      const feeds = parsed.filter(
        (entry): entry is Feed =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as Feed).id === 'string' &&
          typeof (entry as Feed).title === 'string'
      )
      return feeds
    }
  } catch {
    return []
  }

  return []
}

function writeBookmarks(feeds: Feed[]): void {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(feeds))
  window.dispatchEvent(new CustomEvent(BOOKMARKS_UPDATED_EVENT))
}

export function getBookmarkedFeeds(): Feed[] {
  return readBookmarks()
}

export function getBookmarkedFeedIds(): string[] {
  return readBookmarks().map((feed) => feed.id)
}

export function getBookmarkedFeedById(feedId: string): Feed | undefined {
  return readBookmarks().find((feed) => feed.id === feedId)
}

export function isFeedBookmarked(feedId: string): boolean {
  return getBookmarkedFeedIds().includes(feedId)
}

export function toggleFeedBookmark(feed: Feed): boolean {
  const feeds = readBookmarks()
  const exists = feeds.some((entry) => entry.id === feed.id)

  if (exists) {
    writeBookmarks(feeds.filter((entry) => entry.id !== feed.id))
    return false
  }

  cacheFeeds([feed])
  writeBookmarks([feed, ...feeds.filter((entry) => entry.id !== feed.id)])
  return true
}
