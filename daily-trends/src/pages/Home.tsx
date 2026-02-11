import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories } from '../data/mockData'
import { fetchTopFeedsForSelectedCategories } from '../services/news'
import type { Feed } from '../types'
import { BOOKMARKS_UPDATED_EVENT, getBookmarkedFeedIds } from '../utils/bookmarks'
import { getSelectedCategories, hasEnteredHome } from '../utils/session'

export default function Home() {
  const enteredHome = hasEnteredHome()
  const [bookmarkCount, setBookmarkCount] = useState<number>(() => getBookmarkedFeedIds().length)
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const selectedCategoryIds = useMemo(() => getSelectedCategories(), [])
  const selectedCategoryMap = useMemo(
    () =>
      new Map(
        categories
          .filter((category) => selectedCategoryIds.includes(category.id))
          .map((category) => [category.id, category])
      ),
    [selectedCategoryIds]
  )

  useEffect(() => {
    const onBookmarksUpdated = () => setBookmarkCount(getBookmarkedFeedIds().length)
    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [])

  useEffect(() => {
    if (!enteredHome) return

    let active = true
    setLoading(true)
    setError(null)

    fetchTopFeedsForSelectedCategories(selectedCategoryIds, 10)
      .then((result) => {
        if (!active) return
        setFeeds(result)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load news right now. Please try again.'
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [enteredHome, selectedCategoryIds])

  if (!enteredHome) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page feeds-page">
      <header className="header">
        <div className="header-row">
          <h1>Daily Trends</h1>
          <Link to="/bookmarks" className="bookmark-link" aria-label="Open bookmarks">
            🔖
            {bookmarkCount > 0 ? <span className="bookmark-count">{bookmarkCount}</span> : null}
          </Link>
        </div>
        <p className="subtitle">Top 10 trending from your interests</p>
        <Link to="/interests" className="sub-link">
          Edit interests
        </Link>
      </header>
      <main className="main">
        {loading ? <p className="status-text">Loading latest news...</p> : null}
        {error ? <p className="status-text">{error}</p> : null}
        {!loading && feeds.length === 0 ? (
          <div className="empty-state">
            <p>No stories found for your interests right now.</p>
          </div>
        ) : null}
        <ol className="feed-list">
          {feeds.map((feed, index) => {
            const category = selectedCategoryMap.get(feed.categoryId)

            return (
              <li key={feed.id}>
                <div className="feed-row">
                  <Link
                    to={`/feed/${feed.id}`}
                    className="feed-card"
                    state={{ backTo: '/home', feed }}
                  >
                    <span className="feed-rank">#{index + 1}</span>
                    <div className="feed-info">
                      <h2 className="feed-title">{feed.title}</h2>
                      <p className="feed-excerpt">{feed.excerpt}</p>
                      <span className="feed-meta">
                        {feed.source} · {new Date(feed.publishedAt).toLocaleDateString()}
                      </span>
                      {category ? (
                        <span className="feed-category-pill">
                          {category.icon} {category.name}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                  <BookmarkToggle feed={feed} />
                </div>
              </li>
            )
          })}
        </ol>
      </main>
    </div>
  )
}
