import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories } from '../data/mockData'
import { fetchTopFeedsForSelectedCategories } from '../services/news'
import type { Feed } from '../types'
import { BOOKMARKS_UPDATED_EVENT, getBookmarkedFeedIds } from '../utils/bookmarks'
import { getSelectedCategories, hasEnteredHome } from '../utils/session'

const HOME_FEEDS_CACHE_KEY = 'daily-trends-home-feeds-v1'
const PULL_REFRESH_TRIGGER = 72

interface HomeFeedsCache {
  selectedKey: string
  feeds: Feed[]
}

function toSelectedKey(ids: string[]): string {
  return [...ids].sort().join('|')
}

function readHomeFeedsCache(selectedKey: string): Feed[] {
  try {
    const raw = sessionStorage.getItem(HOME_FEEDS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HomeFeedsCache
    if (parsed.selectedKey !== selectedKey) return []
    return Array.isArray(parsed.feeds) ? parsed.feeds : []
  } catch {
    return []
  }
}

function writeHomeFeedsCache(selectedKey: string, feeds: Feed[]): void {
  try {
    const payload: HomeFeedsCache = { selectedKey, feeds }
    sessionStorage.setItem(HOME_FEEDS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore cache write failures in private mode/quota limits.
  }
}

export default function Home() {
  const enteredHome = hasEnteredHome()
  const [bookmarkCount, setBookmarkCount] = useState<number>(() => getBookmarkedFeedIds().length)
  const selectedCategoryIds = useMemo(() => getSelectedCategories(), [])
  const selectedKey = useMemo(() => toSelectedKey(selectedCategoryIds), [selectedCategoryIds])
  const cachedFeeds = useMemo(() => readHomeFeedsCache(selectedKey), [selectedKey])
  const [feeds, setFeeds] = useState<Feed[]>(cachedFeeds)
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(cachedFeeds.length > 0)
  const [loading, setLoading] = useState<boolean>(cachedFeeds.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const mainRef = useRef<HTMLElement | null>(null)
  const pullStartY = useRef<number | null>(null)
  const pullActive = pullDistance > 0
  const selectedCategoryMap = useMemo(
    () =>
      new Map(
        categories
          .filter((category) => selectedCategoryIds.includes(category.id))
          .map((category) => [category.id, category])
      ),
    [selectedCategoryIds]
  )

  const loadFeeds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTopFeedsForSelectedCategories(selectedCategoryIds, 10)
      setFeeds(result)
      writeHomeFeedsCache(selectedKey, result)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load news right now. Please try again.'
      )
    } finally {
      setLoading(false)
      setHasLoadedOnce(true)
    }
  }, [selectedCategoryIds, selectedKey])

  useEffect(() => {
    const onBookmarksUpdated = () => setBookmarkCount(getBookmarkedFeedIds().length)
    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [])

  useEffect(() => {
    if (!enteredHome) return

    if (cachedFeeds.length > 0) {
      setFeeds(cachedFeeds)
      setHasLoadedOnce(true)
      setLoading(false)
      return
    }

    void loadFeeds()
  }, [enteredHome, cachedFeeds, loadFeeds])

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (loading) return
    const container = mainRef.current
    if (!container || container.scrollTop > 0) return
    pullStartY.current = event.touches[0]?.clientY ?? null
  }

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    const startY = pullStartY.current
    if (startY === null) return
    const container = mainRef.current
    if (!container || container.scrollTop > 0) return
    const currentY = event.touches[0]?.clientY ?? startY
    const delta = currentY - startY
    if (delta <= 0) {
      setPullDistance(0)
      return
    }
    setPullDistance(Math.min(96, delta * 0.55))
  }

  const handleTouchEnd = () => {
    if (pullStartY.current === null) return
    const shouldRefresh = pullDistance >= PULL_REFRESH_TRIGGER
    pullStartY.current = null
    setPullDistance(0)
    if (!shouldRefresh || loading) return
    void loadFeeds()
  }

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
      <main
        className="main"
        ref={mainRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {pullActive ? (
          <div
            className={`pull-refresh-indicator ${
              pullDistance >= PULL_REFRESH_TRIGGER ? 'ready' : ''
            }`}
            style={{ height: `${Math.max(26, pullDistance)}px` }}
            aria-hidden="true"
          >
            <span className="loader-spinner" />
          </div>
        ) : null}
        {loading && !hasLoadedOnce ? (
          <div className="center-loader" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
          </div>
        ) : null}
        {loading && hasLoadedOnce ? (
          <div className="center-loader-overlay" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
          </div>
        ) : null}
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
