import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories } from '../data/mockData'
import { fetchTopFeedsPageForSelectedCategories } from '../services/news'
import type { Feed } from '../types'
import { BOOKMARKS_UPDATED_EVENT, getBookmarkedFeedIds } from '../utils/bookmarks'
import { getSelectedCategories, hasEnteredHome } from '../utils/session'

const HOME_FEEDS_CACHE_KEY = 'daily-trends-home-feeds-v1'
const PULL_REFRESH_TRIGGER = 72
const PAGE_SIZE = 15

interface HomeFeedsCache {
  selectedKey: string
  feeds: Feed[]
  nextPage: number
  hasMore: boolean
}

function toSelectedKey(ids: string[]): string {
  return [...ids].sort().join('|')
}

function readHomeFeedsCache(selectedKey: string): HomeFeedsCache | null {
  try {
    const raw = sessionStorage.getItem(HOME_FEEDS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HomeFeedsCache
    if (parsed.selectedKey !== selectedKey) return null
    if (!Array.isArray(parsed.feeds)) return null
    return {
      selectedKey,
      feeds: parsed.feeds,
      nextPage: Number.isInteger(parsed.nextPage) ? Math.max(0, parsed.nextPage) : 0,
      hasMore: typeof parsed.hasMore === 'boolean' ? parsed.hasMore : true,
    }
  } catch {
    return null
  }
}

function writeHomeFeedsCache(cache: HomeFeedsCache): void {
  try {
    sessionStorage.setItem(HOME_FEEDS_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore cache write failures in private mode/quota limits.
  }
}

function mergeUniqueFeeds(prev: Feed[], next: Feed[]): Feed[] {
  if (next.length === 0) return prev
  const seen = new Set(prev.map((feed) => feed.id))
  const merged = [...prev]
  for (const feed of next) {
    if (seen.has(feed.id)) continue
    seen.add(feed.id)
    merged.push(feed)
  }
  return merged
}

export default function Home() {
  const enteredHome = hasEnteredHome()
  const [bookmarkCount, setBookmarkCount] = useState<number>(() => getBookmarkedFeedIds().length)
  const selectedCategoryIds = useMemo(() => getSelectedCategories(), [])
  const selectedKey = useMemo(() => toSelectedKey(selectedCategoryIds), [selectedCategoryIds])
  const cachedHome = useMemo(() => readHomeFeedsCache(selectedKey), [selectedKey])
  const [feeds, setFeeds] = useState<Feed[]>(cachedHome?.feeds ?? [])
  const [nextPage, setNextPage] = useState<number>(cachedHome?.nextPage ?? 0)
  const [hasMore, setHasMore] = useState<boolean>(cachedHome?.hasMore ?? true)
  const [initialLoading, setInitialLoading] = useState<boolean>((cachedHome?.feeds.length ?? 0) === 0)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const mainRef = useRef<HTMLElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
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

  const loadFirstPage = useCallback(async (asRefresh: boolean) => {
    if (asRefresh) setRefreshing(true)
    else setInitialLoading(true)
    setError(null)
    try {
      const result = await fetchTopFeedsPageForSelectedCategories(selectedCategoryIds, PAGE_SIZE, 0)
      const next = result.feeds.length > 0 ? 1 : 0
      setFeeds(result.feeds)
      setNextPage(next)
      setHasMore(result.hasMore)
      writeHomeFeedsCache({
        selectedKey,
        feeds: result.feeds,
        nextPage: next,
        hasMore: result.hasMore,
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load news right now. Please try again.'
      )
    } finally {
      if (asRefresh) setRefreshing(false)
      else setInitialLoading(false)
    }
  }, [selectedCategoryIds, selectedKey])

  const loadNextPage = useCallback(async () => {
    if (initialLoading || refreshing || loadingMore || !hasMore) return

    setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchTopFeedsPageForSelectedCategories(
        selectedCategoryIds,
        PAGE_SIZE,
        nextPage
      )
      const targetPage = nextPage + 1
      setFeeds((prev) => {
        const merged = mergeUniqueFeeds(prev, result.feeds)
        writeHomeFeedsCache({
          selectedKey,
          feeds: merged,
          nextPage: targetPage,
          hasMore: result.hasMore,
        })
        return merged
      })
      setNextPage(targetPage)
      setHasMore(result.hasMore)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load more news right now. Please try again.'
      )
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, initialLoading, loadingMore, nextPage, refreshing, selectedCategoryIds, selectedKey])

  useEffect(() => {
    const onBookmarksUpdated = () => setBookmarkCount(getBookmarkedFeedIds().length)
    window.addEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
    return () => window.removeEventListener(BOOKMARKS_UPDATED_EVENT, onBookmarksUpdated)
  }, [])

  useEffect(() => {
    if (!enteredHome) return

    if (cachedHome && cachedHome.feeds.length > 0) {
      setFeeds(cachedHome.feeds)
      setNextPage(cachedHome.nextPage)
      setHasMore(cachedHome.hasMore)
      setInitialLoading(false)
      return
    }

    void loadFirstPage(false)
  }, [cachedHome, enteredHome, loadFirstPage])

  useEffect(() => {
    if (!enteredHome) return
    const root = mainRef.current
    const target = loadMoreRef.current
    if (!root || !target) return
    if (!hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting) return
        void loadNextPage()
      },
      {
        root,
        rootMargin: '0px 0px 240px 0px',
        threshold: 0.05,
      }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [enteredHome, hasMore, loadNextPage, feeds.length])

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (initialLoading || loadingMore || refreshing) return
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
    if (!shouldRefresh || initialLoading || loadingMore || refreshing) return
    void loadFirstPage(true)
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
        <p className="subtitle">Trending from your interests</p>
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
        {initialLoading ? (
          <div className="center-loader" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
          </div>
        ) : null}
        {refreshing ? (
          <div className="center-loader-overlay" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
          </div>
        ) : null}
        {error ? <p className="status-text">{error}</p> : null}
        {!initialLoading && feeds.length === 0 ? (
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
        {loadingMore ? (
          <div className="feed-load-more-spinner" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
          </div>
        ) : null}
        <div ref={loadMoreRef} className="feed-load-more-anchor" aria-hidden="true" />
      </main>
    </div>
  )
}
