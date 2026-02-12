import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { categories } from '../data/mockData'
import { translateFeedsBatchToEnglish, type FeedTranslationItem } from '../services/feedTranslation'
import { fetchTopFeedsPageForSelectedCategories } from '../services/news'
import type { Feed } from '../types'
import { BOOKMARKS_UPDATED_EVENT, getBookmarkedFeedIds } from '../utils/bookmarks'
import { getSelectedCategories, hasEnteredHome } from '../utils/session'

const HOME_FEEDS_CACHE_KEY = 'daily-trends-home-feeds-v1'
const LAST_SELECTED_FEED_KEY = 'daily-trends-last-selected-feed'
const LAST_HOME_SCROLL_KEY = 'daily-trends-home-scroll-top'
const LAST_HOME_SELECTED_OFFSET_KEY = 'daily-trends-home-selected-offset'
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
  const location = useLocation()
  const enteredHome = hasEnteredHome()
  const [bookmarkCount, setBookmarkCount] = useState<number>(() => getBookmarkedFeedIds().length)
  const selectedCategoryIds = useMemo(() => getSelectedCategories(), [])
  const selectedKey = useMemo(() => toSelectedKey(selectedCategoryIds), [selectedCategoryIds])
  const cachedHome = useMemo(() => readHomeFeedsCache(selectedKey), [selectedKey])
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [nextPage, setNextPage] = useState<number>(0)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [initialLoading, setInitialLoading] = useState<boolean>(true)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFeedId, setSelectedFeedId] = useState<string>(
    () => sessionStorage.getItem(LAST_SELECTED_FEED_KEY) || ''
  )
  const [feedTextMap, setFeedTextMap] = useState<Record<string, FeedTranslationItem>>({})
  const [pullDistance, setPullDistance] = useState(0)
  const mainRef = useRef<HTMLElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const pullStartY = useRef<number | null>(null)
  const didRestoreSelectionRef = useRef(false)
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

  const translateFeedChunks = useCallback(async (items: Feed[]) => {
    const translated: Record<string, FeedTranslationItem> = {}
    for (let offset = 0; offset < items.length; offset += PAGE_SIZE) {
      const chunk = items.slice(offset, offset + PAGE_SIZE)
      if (chunk.length === 0) continue
      const batch = await translateFeedsBatchToEnglish(chunk)
      Object.assign(translated, batch)
    }
    return translated
  }, [])

  const loadFirstPage = useCallback(async (asRefresh: boolean) => {
    if (asRefresh) setRefreshing(true)
    else setInitialLoading(true)
    setError(null)
    try {
      const result = await fetchTopFeedsPageForSelectedCategories(selectedCategoryIds, PAGE_SIZE, 0)
      const translatedMap = await translateFeedsBatchToEnglish(result.feeds)
      const next = result.feeds.length > 0 ? 1 : 0
      setFeeds(result.feeds)
      setFeedTextMap(translatedMap)
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
      const translatedMap = await translateFeedsBatchToEnglish(result.feeds)
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
      setFeedTextMap((prev) => ({ ...prev, ...translatedMap }))
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
      let active = true
      setInitialLoading(true)
      setError(null)
      void (async () => {
        try {
          const translatedMap = await translateFeedChunks(cachedHome.feeds)
          if (!active) return
          setFeeds(cachedHome.feeds)
          setFeedTextMap((prev) => ({ ...prev, ...translatedMap }))
          setNextPage(cachedHome.nextPage)
          setHasMore(cachedHome.hasMore)
        } catch (err: unknown) {
          if (!active) return
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to translate feeds right now. Please pull to refresh.'
          )
        } finally {
          if (active) setInitialLoading(false)
        }
      })()
      return () => {
        active = false
      }
    }

    void loadFirstPage(false)
  }, [cachedHome, enteredHome, loadFirstPage, translateFeedChunks])

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

  useEffect(() => {
    if (didRestoreSelectionRef.current) return
    if (initialLoading) return
    if (feeds.length === 0) return
    const main = mainRef.current
    if (!main) return

    const routeState =
      (
        location.state as {
          lastSelectedFeedId?: unknown
          restoreScrollTop?: unknown
          restoreSelectedOffset?: unknown
        } | null
      ) ?? null
    const routeScrollTop =
      typeof routeState?.restoreScrollTop === 'number' && Number.isFinite(routeState.restoreScrollTop)
        ? Math.max(0, routeState.restoreScrollTop)
        : null
    const fromSessionScrollRaw = sessionStorage.getItem(LAST_HOME_SCROLL_KEY)
    const fromSessionScroll = fromSessionScrollRaw !== null ? Number(fromSessionScrollRaw) : Number.NaN
    const savedScrollTop = Number.isFinite(fromSessionScroll) ? Math.max(0, fromSessionScroll) : null
    const routeSelectedOffset =
      typeof routeState?.restoreSelectedOffset === 'number' &&
      Number.isFinite(routeState.restoreSelectedOffset)
        ? Math.max(0, routeState.restoreSelectedOffset)
        : null
    const fromSessionOffsetRaw = sessionStorage.getItem(LAST_HOME_SELECTED_OFFSET_KEY)
    const fromSessionOffset = fromSessionOffsetRaw !== null ? Number(fromSessionOffsetRaw) : Number.NaN
    const savedSelectedOffset = Number.isFinite(fromSessionOffset)
      ? Math.max(0, fromSessionOffset)
      : null
    const targetScrollTop = routeScrollTop ?? savedScrollTop
    if (targetScrollTop !== null) {
      // Wait one paint so list height is ready before restoring.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          main.scrollTo({ top: targetScrollTop, behavior: 'auto' })
        })
      })
      sessionStorage.removeItem(LAST_HOME_SCROLL_KEY)
      sessionStorage.removeItem(LAST_HOME_SELECTED_OFFSET_KEY)
      didRestoreSelectionRef.current = true
      return
    }

    const selectedStateId = routeState?.lastSelectedFeedId
    const routeSelectedId = typeof selectedStateId === 'string' ? selectedStateId : ''
    const routeStateId = routeSelectedId
    const fromRoute = routeStateId
    const fromSession = sessionStorage.getItem(LAST_SELECTED_FEED_KEY) || ''
    const targetFeedId = fromRoute || fromSession
    if (targetFeedId) {
      setSelectedFeedId(targetFeedId)
    }

    if (!targetFeedId) {
      didRestoreSelectionRef.current = true
      return
    }

    const target = main.querySelector<HTMLElement>(`[data-feed-id="${targetFeedId}"]`)
    if (!target) return

    const targetOffset = routeSelectedOffset ?? savedSelectedOffset
    const top =
      targetOffset !== null
        ? Math.max(0, Math.round(target.offsetTop - targetOffset))
        : Math.max(0, target.offsetTop - 12)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        main.scrollTo({ top, behavior: 'auto' })
      })
    })
    sessionStorage.removeItem(LAST_SELECTED_FEED_KEY)
    sessionStorage.removeItem(LAST_HOME_SCROLL_KEY)
    sessionStorage.removeItem(LAST_HOME_SELECTED_OFFSET_KEY)
    didRestoreSelectionRef.current = true
  }, [feeds, feedTextMap, initialLoading, location.state])

  const handleMainScroll = () => {
    const main = mainRef.current
    if (!main) return
    sessionStorage.setItem(LAST_HOME_SCROLL_KEY, String(Math.max(0, Math.round(main.scrollTop))))
  }

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
        onScroll={handleMainScroll}
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
            const displayText = feedTextMap[feed.id]
            if (!displayText) return null

            return (
              <li key={feed.id}>
                <div className="feed-row">
                  <Link
                    to={`/feed/${feed.id}`}
                    className={`feed-card ${selectedFeedId === feed.id ? 'selected' : ''}`}
                    state={{
                      backTo: '/home',
                      feed,
                      fromHomeScrollTop: Math.max(0, Math.round(mainRef.current?.scrollTop ?? 0)),
                    }}
                    onClick={(event) => {
                      const main = mainRef.current
                      const card = event.currentTarget as HTMLElement
                      const selectedOffset = main ? Math.max(0, card.offsetTop - main.scrollTop) : 0
                      setSelectedFeedId(feed.id)
                      sessionStorage.setItem(LAST_SELECTED_FEED_KEY, feed.id)
                      sessionStorage.setItem(
                        LAST_HOME_SCROLL_KEY,
                        String(Math.max(0, Math.round(mainRef.current?.scrollTop ?? 0)))
                      )
                      sessionStorage.setItem(
                        LAST_HOME_SELECTED_OFFSET_KEY,
                        String(Math.max(0, Math.round(selectedOffset)))
                      )
                    }}
                    data-feed-id={feed.id}
                  >
                    <span className="feed-rank">#{index + 1}</span>
                    <div className="feed-info">
                      <h2 className="feed-title">{displayText.title}</h2>
                      <p className="feed-excerpt">{displayText.excerpt}</p>
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
