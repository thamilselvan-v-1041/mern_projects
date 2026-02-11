import { useEffect, useState, type MouseEvent } from 'react'
import {
  BOOKMARKS_UPDATED_EVENT,
  isFeedBookmarked,
  toggleFeedBookmark,
} from '../utils/bookmarks'

interface BookmarkToggleProps {
  feedId: string
}

export default function BookmarkToggle({ feedId }: BookmarkToggleProps) {
  const [bookmarked, setBookmarked] = useState<boolean>(() => isFeedBookmarked(feedId))

  useEffect(() => {
    setBookmarked(isFeedBookmarked(feedId))

    const onBookmarksUpdated = () => {
      setBookmarked(isFeedBookmarked(feedId))
    }

    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [feedId])

  const onToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setBookmarked(toggleFeedBookmark(feedId))
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
