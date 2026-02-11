import { Link, useParams } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories, getFeedsForCategory } from '../data/mockData'

export default function Feeds() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const category = categories.find((c) => c.id === categoryId)
  const feeds = categoryId ? getFeedsForCategory(categoryId) : []

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
        <ol className="feed-list">
          {feeds.map((feed, index) => (
            <li key={feed.id}>
              <div className="feed-row">
                <Link
                  to={`/feed/${feed.id}`}
                  className="feed-card"
                  state={{ backTo: `/feeds/${category.id}` }}
                >
                  <span className="feed-rank">#{index + 1}</span>
                  <div className="feed-info">
                    <h2 className="feed-title">{feed.title}</h2>
                    <p className="feed-excerpt">{feed.excerpt}</p>
                    <span className="feed-meta">{feed.source} · {new Date(feed.publishedAt).toLocaleDateString()}</span>
                  </div>
                </Link>
                <BookmarkToggle feedId={feed.id} />
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}
