import { Link } from 'react-router-dom'
import { getFeedById } from '../data/mockData'
import { getBookmarkedFeedIds } from '../utils/bookmarks'

export default function Bookmarks() {
  const bookmarkedFeedIds = getBookmarkedFeedIds()
  const bookmarkedFeeds = [...bookmarkedFeedIds]
    .reverse()
    .map((feedId) => getFeedById(feedId))
    .filter((feed): feed is NonNullable<typeof feed> => Boolean(feed))

  return (
    <div className="page feeds-page">
      <header className="header">
        <Link to="/home" className="back-link" aria-label="Back to home">
          ← Back
        </Link>
        <h1>Bookmarks</h1>
        <p className="subtitle">Saved feeds for future reference</p>
      </header>
      <main className="main">
        {bookmarkedFeeds.length === 0 ? (
          <div className="empty-state">
            <p>No bookmarked feeds yet.</p>
          </div>
        ) : (
          <ol className="feed-list">
            {bookmarkedFeeds.map((feed, index) => (
              <li key={feed.id}>
                <Link
                  to={`/feed/${feed.id}`}
                  className="feed-card"
                  state={{ backTo: '/bookmarks' }}
                >
                  <span className="feed-rank">#{index + 1}</span>
                  <div className="feed-info">
                    <h2 className="feed-title">{feed.title}</h2>
                    <p className="feed-excerpt">{feed.excerpt}</p>
                    <span className="feed-meta">
                      {feed.source} · {new Date(feed.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  )
}
