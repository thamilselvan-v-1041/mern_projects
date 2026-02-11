import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import BookmarkToggle from '../components/BookmarkToggle'
import { getFeedById } from '../data/mockData'
import { fetchReadableArticleHtml } from '../services/articleContent'
import { buildBannerForFeed } from '../services/news'
import { summarizeWithSarvam } from '../services/sarvamSummary'
import type { Feed } from '../types'
import { getBookmarkedFeedById } from '../utils/bookmarks'

export default function FeedDetail() {
  const { feedId } = useParams<{ feedId: string }>()
  const location = useLocation()
  const state = (location.state as { backTo?: unknown; feed?: Feed } | null) ?? null
  const feed = state?.feed || (feedId ? getBookmarkedFeedById(feedId) || getFeedById(feedId) : undefined)
  const backTo =
    typeof state?.backTo === 'string'
      ? state.backTo
      : '/home'
  const [contentReady, setContentReady] = useState(false)
  const [imageReady, setImageReady] = useState(false)
  const [showLoader, setShowLoader] = useState(true)
  const [contentHtml, setContentHtml] = useState<string>('')
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryDoneForId, setSummaryDoneForId] = useState<string | null>(null)
  const [displayTitle, setDisplayTitle] = useState<string>('')
  const bannerSrc = useMemo(() => {
    if (!feed) return ''
    const generated = buildBannerForFeed(feed, displayTitle || feed.title)
    return generated || feed.imageUrl || ''
  }, [feed, displayTitle])

  useEffect(() => {
    setContentReady(false)
    setImageReady(false)
    setShowLoader(true)
    setContentHtml('')
    setSummaryBusy(false)
    setSummaryDoneForId(null)
    setDisplayTitle(feed?.title || '')
  }, [feed?.id, feed?.imageUrl])

  useEffect(() => {
    if (!feed) return

    let active = true
    const fallbackTimeout = window.setTimeout(() => {
      if (!active) return
      setContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
      setContentReady(true)
    }, 4000)

    if (!feed.link) {
      setContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
      setContentReady(true)
      window.clearTimeout(fallbackTimeout)
      return () => {
        active = false
      }
    }

    fetchReadableArticleHtml(feed.link)
      .then((html) => {
        if (!active) return
        setContentHtml(html || (feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`))
        setContentReady(true)
        window.clearTimeout(fallbackTimeout)
      })
      .catch(() => {
        if (!active) return
        setContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
        setContentReady(true)
        window.clearTimeout(fallbackTimeout)
      })

    return () => {
      active = false
      window.clearTimeout(fallbackTimeout)
    }
  }, [feed])

  useEffect(() => {
    if (!feed) return
    if (!contentReady) return
    if (!contentHtml.trim()) return
    if (summaryDoneForId === feed.id) return

    let active = true
    setSummaryBusy(true)

    summarizeWithSarvam(feed.id, feed.title, contentHtml)
      .then((result) => {
        if (!active) return
        if (result.summaryHtml && result.summaryHtml.trim()) {
          setContentHtml(result.summaryHtml)
        }
        if (result.title && result.title.trim()) setDisplayTitle(result.title)
        setSummaryDoneForId(feed.id)
      })
      .finally(() => {
        if (active) setSummaryBusy(false)
      })

    return () => {
      active = false
    }
  }, [feed, contentReady, contentHtml, summaryDoneForId])

  useEffect(() => {
    if (!feed) return

    if (!feed.imageUrl) {
      setImageReady(true)
      return
    }

    let active = true
    const probe = new Image()
    probe.src = feed.imageUrl
    probe.onload = () => {
      if (active) setImageReady(true)
    }
    probe.onerror = () => {
      if (active) setImageReady(true)
    }

    const timeoutId = window.setTimeout(() => {
      if (active) setImageReady(true)
    }, 1800)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [feed?.id, feed?.imageUrl])

  useEffect(() => {
    if (!feed) return
    if (!contentReady || !imageReady) return
    setShowLoader(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [feed, contentReady, imageReady])

  useEffect(() => {
    if (!displayTitle.trim()) return
    document.title = `${displayTitle} | Daily Trends`
  }, [displayTitle])

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
          <BookmarkToggle feed={feed} />
        </div>
      </header>
      <article className="article">
        {showLoader ? (
          <div className="article-loader" role="status" aria-live="polite">
            <span className="loader-spinner" aria-hidden="true" />
            <span>Loading article...</span>
          </div>
        ) : null}
        {bannerSrc && (
          <img
            src={bannerSrc}
            alt=""
            className={`article-image ${summaryDoneForId === feed.id ? 'article-image-expanded' : ''}`}
            loading="eager"
            decoding="async"
            onLoad={() => setImageReady(true)}
            onError={() => setImageReady(true)}
          />
        )}
        <div className="article-body">
          {summaryBusy ? (
            <div className="summary-spinner-wrap" aria-label="Refining content">
              <span className="loader-spinner" aria-hidden="true" />
            </div>
          ) : null}
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: contentHtml || `<p>${feed.excerpt}</p>` }}
          />
        </div>
      </article>
    </div>
  )
}
