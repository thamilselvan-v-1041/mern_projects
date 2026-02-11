import { Link, useLocation, useParams } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { getFeedById } from '../data/mockData'

export default function FeedDetail() {
  const { feedId } = useParams<{ feedId: string }>()
  const location = useLocation()
  const feed = feedId ? getFeedById(feedId) : undefined
  const backTo =
    typeof (location.state as { backTo?: unknown } | null)?.backTo === 'string'
      ? ((location.state as { backTo: string }).backTo)
      : '/home'

  if (!feed) {
    return (
      <div className="page">
        <p>Article not found.</p>
        <Link to="/home">Back to home</Link>
      </div>
    )
  }

  return (
    <div className="page detail-page">
      <header className="header header-detail">
        <div className="header-row">
          <Link to={backTo} className="back-link" aria-label="Back">
            ← Back
          </Link>
          <BookmarkToggle feedId={feed.id} />
        </div>
      </header>
      <article className="article">
        {feed.imageUrl && (
          <img src={feed.imageUrl} alt="" className="article-image" loading="lazy" />
        )}
        <div className="article-body">
          <h1 className="article-title">{feed.title}</h1>
          <p className="article-meta">{feed.source} · {new Date(feed.publishedAt).toLocaleString()}</p>
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: feed.content }}
          />
        </div>
      </article>
    </div>
  )
}
