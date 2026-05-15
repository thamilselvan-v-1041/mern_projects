import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Full-page book preview shown when the user clicks a card in BookList.
 *
 * Layout: metadata header on top, paginated Google Books Embedded Viewer
 * beneath for books that have an ISBN. The viewer is loaded on demand via
 * Google's public jsapi (no API key needed); we wire its previousPage /
 * nextPage methods to our own buttons so the pagination matches the rest of
 * the app's UX.
 */
export default function BookPreview({ showToast }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [borrowing, setBorrowing] = useState(false);

  const book = location.state?.book;

  if (!book) {
    return (
      <section className="card book-preview">
        <h2>Book preview</h2>
        <p className="muted">
          We don't have details cached for this book (id: <code>{id}</code>).
          {' '}<Link to="/">Browse the catalogue</Link> and click a book to see its preview.
        </p>
      </section>
    );
  }

  const handleBorrow = async () => {
    setBorrowing(true);
    try {
      // TODO: wire to a real server endpoint that imports the book into the
      // Data Store and lends it to the current user. Mocked for now so the
      // borrow UX is testable end-to-end.
      await new Promise((r) => setTimeout(r, 400));
      showToast?.(`"${book.title}" added to your loans (mock).`, 'success');
      navigate('/');
    } catch (err) {
      showToast?.(err.message || 'Failed to borrow this book', 'error');
    } finally {
      setBorrowing(false);
    }
  };

  return (
    <section className="card book-preview">
      <Link to="/" className="btn-link book-preview-back">← Back to catalogue</Link>

      <div className="book-preview-body">
        {book.thumbnail ? (
          <img
            className="book-preview-cover"
            src={book.thumbnail}
            alt={book.title}
          />
        ) : (
          <div className="book-preview-cover book-thumb-empty" aria-hidden="true">📖</div>
        )}

        <div className="book-preview-meta">
          <h2 className="book-preview-title">
            {book.title}
            {book.subtitle && <span className="muted">: {book.subtitle}</span>}
          </h2>
          <p className="book-preview-author">{book.author || 'Unknown author'}</p>

          <div className="book-preview-tags">
            <span className={`badge badge-${book.status || 'available'}`}>
              {book.status || 'available'}
            </span>
            {book.isbn       && <span className="badge badge-soft">ISBN {book.isbn}</span>}
            {book.publisher  && <span className="badge badge-soft">{book.publisher}</span>}
            {book.publishedAt && <span className="badge badge-soft">{book.publishedAt}</span>}
            {book.pageCount  && <span className="badge badge-soft">{book.pageCount} pages</span>}
          </div>

          {Array.isArray(book.categories) && book.categories.length > 0 && (
            <p className="book-categories muted">{book.categories.slice(0, 6).join(' · ')}</p>
          )}

          {book.description && (
            <p className="book-preview-desc">{book.description}</p>
          )}

          <div className="book-preview-actions">
            {isAuthenticated ? (
              <button
                type="button"
                className="btn-borrow"
                onClick={handleBorrow}
                disabled={borrowing}
              >
                {borrowing
                  ? 'Borrowing…'
                  : `Borrow this book${user?.first_name ? ', ' + user.first_name : ''}`}
              </button>
            ) : (
              <p className="muted">
                <strong>Sign in</strong> from the top-right to borrow this book.
              </p>
            )}
          </div>
        </div>
      </div>

      <BookReader book={book} />
    </section>
  );
}

/* ─── Reader dispatch ────────────────────────────────────────────────────────
 * Priority:
 *   1. Internet Archive BookReader  (book.iaId present)
 *      — full scanned pages with built-in pagination, no quotas.
 *   2. Google Books embedded viewer (ISBN present, no iaId)
 *      — preview pages only; many copyrighted titles return "no preview".
 *   3. Nothing to render — show metadata-only fallback.
 */
function BookReader({ book }) {
  if (book.iaId) {
    return <InternetArchiveReader iaId={book.iaId} title={book.title} />;
  }
  if (book.isbn) {
    return <GoogleBooksReader isbn={book.isbn} title={book.title} fallbackUrl={book.previewLink} />;
  }
  return (
    <p className="muted book-reader-fallback">
      No previewable copy is available for this book. We need either an Internet
      Archive scan (Open Library&apos;s <code>ia</code> field) or an ISBN to load
      a reader.
    </p>
  );
}

/* ─── Internet Archive BookReader (preferred for public-domain works) ────── */

function InternetArchiveReader({ iaId, title }) {
  // archive.org/embed serves the same BookReader you get on the IA site
  // (full-page flip, zoom, search, table-of-contents — all keyboard-navigable
  // inside the iframe). No API key, no quota. For public-domain works the
  // entire book is viewable; for "borrowable" titles the reader shows a 14-day
  // borrow prompt inside the iframe, which is acceptable graceful degradation.
  const src = `https://archive.org/embed/${encodeURIComponent(iaId)}`;
  return (
    <div className="book-reader">
      <h3 className="book-reader-heading">Read preview</h3>
      <iframe
        title={`Internet Archive reader for ${title}`}
        src={src}
        className="book-reader-canvas"
        allowFullScreen
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
      <p className="muted book-reader-status">
        Powered by the Internet Archive — use the toolbar inside the reader to
        flip pages, zoom, or open the table of contents. Open the full reader on{' '}
        <a href={`https://archive.org/details/${encodeURIComponent(iaId)}`} target="_blank" rel="noreferrer">
          archive.org ↗
        </a>.
      </p>
    </div>
  );
}

/* ─── Embedded Google Books reader with custom pagination ────────────────── */

const GBOOKS_JSAPI_ID = 'gbooks-jsapi';
const GBOOKS_JSAPI_URL = 'https://www.google.com/books/jsapi.js';

/**
 * Lazy-loads the public Google Books JSAPI once per page, then memoises the
 * resolved namespace so subsequent BookPreview navigations reuse the same
 * script tag instead of re-injecting it.
 */
function loadGoogleBooksApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.books) return Promise.resolve(window.google.books);
  return new Promise((resolve, reject) => {
    let script = document.getElementById(GBOOKS_JSAPI_ID);
    const onReady = () => {
      try {
        window.google.books.load();
        window.google.books.setOnLoadCallback(() => resolve(window.google.books));
      } catch (e) { reject(e); }
    };
    if (script) {
      // Script already injected but may not be loaded yet.
      if (window.google?.books) onReady();
      else script.addEventListener('load', onReady, { once: true });
      return;
    }
    script = document.createElement('script');
    script.id = GBOOKS_JSAPI_ID;
    script.src = GBOOKS_JSAPI_URL;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Failed to load Google Books JS API'));
    document.body.appendChild(script);
  });
}

function GoogleBooksReader({ isbn, title, fallbackUrl }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  // 'loading' → script + viewer initializing
  // 'ready'    → preview pages available, pagination controls visible
  // 'unavailable' → ISBN not in GB catalog or no preview
  // 'error'    → script failed to load
  const [state, setState] = useState('loading');
  const [pageInfo, setPageInfo] = useState({ current: null, total: null });

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setPageInfo({ current: null, total: null });

    loadGoogleBooksApi()
      .then((gb) => {
        if (cancelled || !canvasRef.current) return;
        const viewer = new gb.DefaultViewer(canvasRef.current);
        viewerRef.current = viewer;
        const cleanIsbn = String(isbn).replace(/[^0-9Xx]/g, '');
        // JSAPI signature: load(id, notFoundCallback, successCallback, initialPageId)
        // — note: NOT (success, notFound). Mixing them up means the viewer
        // appears empty even when it loaded fine.
        viewer.load(
          `ISBN:${cleanIsbn}`,
          () => { if (!cancelled) setState('unavailable'); },   // not-found / no preview
          () => {                                                // success
            if (cancelled) return;
            setState('ready');
            refreshPageInfo(viewer);
          }
        );
      })
      .catch(() => { if (!cancelled) setState('error'); });

    return () => {
      cancelled = true;
      // DefaultViewer has no public dispose method; clearing the canvas is
      // sufficient because a new instance overwrites the same div on next mount.
    };
  }, [isbn]);

  function refreshPageInfo(viewer) {
    // The DefaultViewer doesn't expose current/total page count through a
    // stable public API. We optimistically try a couple of method names; if
    // they don't exist we just leave the counter blank and let the buttons
    // drive navigation. This is a best-effort enhancement, not a hard dep.
    try {
      const current = viewer.getPageNumber?.();
      const total   = viewer.getPageCount?.();
      setPageInfo({
        current: typeof current === 'number' ? current : null,
        total:   typeof total   === 'number' ? total   : null
      });
    } catch { /* best-effort only */ }
  }

  const goPrev = () => {
    viewerRef.current?.previousPage?.();
    // Give the viewer a frame to update its internal page index.
    requestAnimationFrame(() => viewerRef.current && refreshPageInfo(viewerRef.current));
  };
  const goNext = () => {
    viewerRef.current?.nextPage?.();
    requestAnimationFrame(() => viewerRef.current && refreshPageInfo(viewerRef.current));
  };

  return (
    <div className="book-reader">
      <h3 className="book-reader-heading">Read preview</h3>

      <div ref={canvasRef} className="book-reader-canvas" aria-label={`Embedded preview for ${title}`} />

      {state === 'loading' && (
        <p className="muted book-reader-status">Loading Google Books preview…</p>
      )}

      {state === 'unavailable' && (
        <p className="muted book-reader-status">
          No preview pages are available for this book on Google Books.
          {fallbackUrl && (
            <> Try opening it directly: <a href={fallbackUrl} target="_blank" rel="noreferrer">read on Google Books ↗</a></>
          )}
        </p>
      )}

      {state === 'error' && (
        <p className="muted book-reader-status">
          Couldn't load the Google Books viewer (network blocked?).
        </p>
      )}

      {state === 'ready' && (
        <div className="book-reader-pagination">
          <button type="button" className="btn-page" onClick={goPrev} aria-label="Previous page">
            ← Previous page
          </button>
          <span className="book-reader-page-info muted">
            {pageInfo.current && pageInfo.total
              ? `Page ${pageInfo.current} of ${pageInfo.total}`
              : pageInfo.current
                ? `Page ${pageInfo.current}`
                : 'Use the buttons or the viewer controls to flip pages'}
          </span>
          <button type="button" className="btn-page" onClick={goNext} aria-label="Next page">
            Next page →
          </button>
        </div>
      )}
    </div>
  );
}
