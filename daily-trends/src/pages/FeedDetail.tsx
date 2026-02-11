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
  const [rawContentHtml, setRawContentHtml] = useState<string>('')
  const [displayReady, setDisplayReady] = useState(false)
  const [contentHtml, setContentHtml] = useState<string>('')
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryDoneForId, setSummaryDoneForId] = useState<string | null>(null)
  const [displayTitle, setDisplayTitle] = useState<string>('')
  const bannerSrc = useMemo(() => {
    if (!feed) return ''
    if (!displayReady) return ''
    const generated = buildBannerForFeed(feed, displayTitle || feed.title)
    return generated || feed.imageUrl || ''
  }, [feed, displayReady, displayTitle])

  useEffect(() => {
    setContentReady(false)
    setRawContentHtml('')
    setDisplayReady(false)
    setContentHtml('')
    setSummaryBusy(false)
    setSummaryDoneForId(null)
    setDisplayTitle('')
  }, [feed?.id, feed?.imageUrl])

  useEffect(() => {
    if (!feed) return

    let active = true
    const fallbackTimeout = window.setTimeout(() => {
      if (!active) return
      setRawContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
      setContentReady(true)
    }, 4000)

    if (!feed.link) {
      setRawContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
      setContentReady(true)
      window.clearTimeout(fallbackTimeout)
      return () => {
        active = false
      }
    }

    fetchReadableArticleHtml(feed.link)
      .then((html) => {
        if (!active) return
        setRawContentHtml(html || (feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`))
        setContentReady(true)
        window.clearTimeout(fallbackTimeout)
      })
      .catch(() => {
        if (!active) return
        setRawContentHtml(feed.content?.trim() ? feed.content : `<p>${feed.excerpt}</p>`)
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
    if (!rawContentHtml.trim()) return
    if (summaryDoneForId === feed.id) return

    let active = true
    let revealTimeoutId: number | null = null
    setSummaryBusy(true)
    setDisplayReady(false)

    const reveal = (title: string, summaryHtml: string) => {
      revealTimeoutId = window.setTimeout(() => {
        if (!active) return
        setContentHtml(summaryHtml)
        setDisplayTitle(title)
        setSummaryDoneForId(feed.id)
        setDisplayReady(true)
      }, 1000)
    }

    summarizeWithSarvam(feed.id, feed.title, rawContentHtml)
      .then((result) => {
        if (!active) return
        const finalContent = result.summaryHtml?.trim()
          ? result.summaryHtml
          : rawContentHtml || `<p>${feed.excerpt}</p>`
        const finalTitle = result.title?.trim() ? result.title : feed.title

        reveal(finalTitle, finalContent)
      })
      .catch(() => {
        if (!active) return
        reveal(feed.title, rawContentHtml || `<p>${feed.excerpt}</p>`)
      })
      .finally(() => {
        if (active) setSummaryBusy(false)
      })

    return () => {
      active = false
      if (revealTimeoutId !== null) window.clearTimeout(revealTimeoutId)
    }
  }, [feed, contentReady, rawContentHtml, summaryDoneForId])

  useEffect(() => {
    if (!displayTitle.trim()) return
    document.title = `${displayTitle} | Daily Trends`
  }, [displayTitle])

  useEffect(() => {
    if (!displayReady) return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [displayReady])

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
        {!displayReady || summaryBusy ? (
          <div className="article-pending-view" aria-label="Refining content">
            <div className="summary-spinner-wrap">
              <span className="loader-spinner" aria-hidden="true" />
            </div>
          </div>
        ) : (
          <>
            {bannerSrc ? (
              <img
                src={bannerSrc}
                alt=""
                className={`article-image ${summaryDoneForId === feed.id ? 'article-image-expanded' : ''}`}
                loading="eager"
                decoding="async"
              />
            ) : null}
            <div className="article-body">
              <div
                className="article-content"
                dangerouslySetInnerHTML={{ __html: contentHtml || `<p>${feed.excerpt}</p>` }}
              />
            </div>
          </>
        )}
      </article>
    </div>
  )
}
