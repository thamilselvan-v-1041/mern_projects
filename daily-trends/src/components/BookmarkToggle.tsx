import { useEffect, useState, type MouseEvent } from 'react'
import type { Feed } from '../types'
import {
  BOOKMARKS_UPDATED_EVENT,
  isFeedBookmarked,
  toggleFeedBookmark,
} from '../utils/bookmarks'

interface BookmarkToggleProps {
  feed: Feed
}

export default function BookmarkToggle({ feed }: BookmarkToggleProps) {
  const [bookmarked, setBookmarked] = useState<boolean>(() => isFeedBookmarked(feed.id))

  useEffect(() => {
    setBookmarked(isFeedBookmarked(feed.id))

    const onBookmarksUpdated = () => {
      setBookmarked(isFeedBookmarked(feed.id))
    }

    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [feed.id])

  const onToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setBookmarked(toggleFeedBookmark(feed))
  }

  return (
    <button
      type="button"
      className={`bookmark-toggle ${bookmarked ? 'active' : ''}`}
      aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      onClick={onToggle}
    >
      {bookmarked ? '🔖' : '📑'}
    </button>
  )
}
