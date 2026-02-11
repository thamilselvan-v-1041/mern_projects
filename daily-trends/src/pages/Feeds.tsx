import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories } from '../data/mockData'
import { fetchFeedsForCategory } from '../services/news'
import type { Feed } from '../types'

export default function Feeds() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const category = categories.find((c) => c.id === categoryId)
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!category) return

    let active = true
    setLoading(true)
    setError(null)

    fetchFeedsForCategory(category.id, 10)
      .then((result) => {
        if (active) setFeeds(result)
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
  }, [category])

  if (!category) {
    return (
      <div className="page">
        <p>Category not found.</p>
        <Link to="/home">Back to home</Link>
      </div>
    )
  }

  return (
    <div className="page feeds-page">
      <header className="header">
        <Link to="/home" className="back-link" aria-label="Back to home">
          ← Back
        </Link>
        <h1>{category.name}</h1>
        <p className="subtitle">Top 10 trending today</p>
      </header>
      <main className="main">
        {loading ? <p className="status-text">Loading latest news...</p> : null}
        {error ? <p className="status-text">{error}</p> : null}
        {!loading && feeds.length === 0 ? (
          <div className="empty-state">
            <p>No stories found for this category right now.</p>
          </div>
        ) : null}
        <ol className="feed-list">
          {feeds.map((feed, index) => (
            <li key={feed.id}>
              <div className="feed-row">
                <Link
                  to={`/feed/${feed.id}`}
                  className="feed-card"
                  state={{ backTo: `/feeds/${category.id}`, feed }}
                >
                  <span className="feed-rank">#{index + 1}</span>
                  <div className="feed-info">
                    <h2 className="feed-title">{feed.title}</h2>
                    <p className="feed-excerpt">{feed.excerpt}</p>
                    <span className="feed-meta">{feed.source} · {new Date(feed.publishedAt).toLocaleDateString()}</span>
                  </div>
                </Link>
                <BookmarkToggle feed={feed} />
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}
