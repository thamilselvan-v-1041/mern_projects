const BOOKMARKS_KEY = 'dailyTrends.bookmarks'
export const BOOKMARKS_UPDATED_EVENT = 'dailyTrends:bookmarks-updated'

export function getBookmarkedFeedIds(): string[] {
  const raw = localStorage.getItem(BOOKMARKS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    return []
  }

  return []
}

function writeBookmarkedFeedIds(ids: string[]): void {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids))
  window.dispatchEvent(new CustomEvent(BOOKMARKS_UPDATED_EVENT))
}

export function isFeedBookmarked(feedId: string): boolean {
  return getBookmarkedFeedIds().includes(feedId)
}

export function toggleFeedBookmark(feedId: string): boolean {
  const ids = getBookmarkedFeedIds()
  const exists = ids.includes(feedId)

  if (exists) {
    writeBookmarkedFeedIds(ids.filter((id) => id !== feedId))
    return false
  }

  writeBookmarkedFeedIds([...ids, feedId])
  return true
}
