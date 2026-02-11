import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories, getTopFeedsForCategories } from '../data/mockData'
import { BOOKMARKS_UPDATED_EVENT, getBookmarkedFeedIds } from '../utils/bookmarks'
import { getSelectedCategories, hasEnteredHome } from '../utils/session'

export default function Home() {
  if (!hasEnteredHome()) {
    return <Navigate to="/" replace />
  }

  const [bookmarkCount, setBookmarkCount] = useState<number>(() => getBookmarkedFeedIds().length)
  const selectedCategoryIds = getSelectedCategories()
  const selectedCategoryMap = new Map(
    categories
      .filter((category) => selectedCategoryIds.includes(category.id))
      .map((category) => [category.id, category])
  )
  const feeds = getTopFeedsForCategories(selectedCategoryIds, 10)

  useEffect(() => {
    const onBookmarksUpdated = () => setBookmarkCount(getBookmarkedFeedIds().length)
    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [])

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
        <ol className="feed-list">
          {feeds.map((feed, index) => {
            const category = selectedCategoryMap.get(feed.categoryId)

            return (
              <li key={feed.id}>
                <div className="feed-row">
                  <Link
                    to={`/feed/${feed.id}`}
                    className="feed-card"
                    state={{ backTo: '/home' }}
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
                  <BookmarkToggle feedId={feed.id} />
                </div>
              </li>
            )
          })}
        </ol>
      </main>
    </div>
  )
}
