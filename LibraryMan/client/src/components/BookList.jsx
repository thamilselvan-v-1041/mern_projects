import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useBookFilters from '../hooks/useBookFilters';
import Pagination from './Pagination.jsx';

/**
 * BookList — primary catalog view.
 *
 * Modes:
 *   • Default (no `onLoadMore`):  table + filters + client pagination
 *                                 (used for the local Data Store inventory).
 *   • Lazy mode  (`onLoadMore`):  grid/list with view toggle, infinite-load
 *                                 button at the bottom (used for the home
 *                                 page's popular catalogue).
 *
 * Props
 *   books          Array<book>
 *   defaultStatus  'all' | 'available' | 'lent'  — initial status filter
 *   heading        string                        — custom card title
 *   hasMore        boolean                       — server reports more results available
 *   onLoadMore     () => void                    — load the next batch
 *   loadingMore    boolean
 *   source         string                        — upstream label (e.g. 'google-books')
 *   showCheckbox   boolean                       — per-row select toggle visible only when signed in
 */
// Two-letter / three-letter ISO codes Open Library accepts in `language:`.
// Empty value = "any" (don't constrain).
const LANGUAGES = [
  { code: '',    label: 'Any language' },
  { code: 'eng', label: 'English'      },
  { code: 'hin', label: 'Hindi'        },
  { code: 'tam', label: 'Tamil'        },
  { code: 'ben', label: 'Bengali'      },
  { code: 'tel', label: 'Telugu'       },
  { code: 'mar', label: 'Marathi'      },
  { code: 'guj', label: 'Gujarati'     },
  { code: 'kan', label: 'Kannada'      },
  { code: 'mal', label: 'Malayalam'    },
  { code: 'pan', label: 'Punjabi'      },
  { code: 'urd', label: 'Urdu'         },
  { code: 'san', label: 'Sanskrit'     }
];

// OL subjects are arbitrary strings; we expose a curated set that maps
// reliably to Open Library's catalog tags.
const CATEGORIES = [
  { value: '',                       label: 'Any category'  },
  { value: 'romance',                label: 'Romance'       },
  { value: 'literature',             label: 'Literature'    },
  { value: 'short_stories',          label: 'Short stories' },
  { value: 'children',               label: 'Children'      },
  { value: 'mystery',                label: 'Mystery'       },
  { value: 'thrillers',              label: 'Thriller'      },
  { value: 'fantasy',                label: 'Fantasy'       },
  { value: 'science_fiction',        label: 'Science Fiction' },
  { value: 'historical_fiction',     label: 'Historical Fiction' },
  { value: 'biography',              label: 'Biography'     },
  { value: 'history',                label: 'History'       },
  { value: 'philosophy',             label: 'Philosophy'    },
  { value: 'poetry',                 label: 'Poetry'        },
  { value: 'self-help',              label: 'Self-help'     },
  { value: 'business',               label: 'Business'      },
  { value: 'cooking',                label: 'Cooking'       },
  { value: 'religion',               label: 'Religion'      }
];

export default function BookList({
  books = [],
  defaultStatus = 'all',
  heading,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  source,
  showCheckbox = false,
  searchQuery,
  onSearchChange,
  popularFilters,
  onPopularFiltersChange
}) {
  const lazyMode = typeof onLoadMore === 'function';
  const externalSearch = typeof onSearchChange === 'function';
  const [viewMode, setViewMode] = useState(lazyMode ? 'grid' : 'list');
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const {
    state, authors, pageItems, totalPages, totalCount, matchCount, filtered, set, reset
  } = useBookFilters(books, {
    initialStatus: defaultStatus,
    // In lazy mode the server controls paging, so don't slice client-side.
    pageSize: lazyMode ? Math.max(books.length, 1) : undefined,
    // When App.jsx drives search via the server, suppress the client-side
    // substring filter — books are already the filtered result set.
    skipQuery: externalSearch
  });

  // The search input is either App-controlled (server search) or hook-managed
  // (client-side substring filter on already-loaded books).
  const queryValue   = externalSearch ? (searchQuery ?? '') : state.query;
  const handleQuery  = externalSearch ? onSearchChange      : set.query;

  // Server-side filters (language + category) — rendered only when the parent
  // wires up `popularFilters` + `onPopularFiltersChange` (home page only).
  const serverFilters = typeof onPopularFiltersChange === 'function' && popularFilters;
  const updateServerFilter = (key, value) => {
    if (!serverFilters) return;
    onPopularFiltersChange({ ...popularFilters, [key]: value });
  };

  const isFiltered =
    queryValue.trim() !== '' ||
    state.status !== defaultStatus ||
    state.author !== 'all' ||
    state.sort !== 'title-asc';

  const titleText = heading
    ?? (defaultStatus === 'available' ? 'Available Books' : 'All Books');

  // Lazy mode renders every loaded+filtered book (no client pagination cap)
  const itemsToRender = lazyMode ? filtered : pageItems;

  // Only show the bare "library empty" message in the legacy (non-lazy) mode —
  // in lazy mode the section/search input must always render so the user can
  // change or clear their query, even when the current result set is empty.
  if (!lazyMode && !totalCount && !loadingMore) {
    return <div className="empty">No books in the library yet.</div>;
  }

  return (
    <section className="card">
      <header className="list-header">
        <h2>
          {titleText}{' '}
          <span className="muted">
            ({matchCount}{matchCount !== totalCount ? ` of ${totalCount}` : ''}
            {lazyMode && hasMore ? '+' : ''})
          </span>
          {source && (
            <span className="muted source-tag" title={`Catalogue source: ${source}`}>
              · {source}
            </span>
          )}
        </h2>

        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            aria-label="Grid view"
          >
            ▦ Grid
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            aria-label="List view"
          >
            ☰ List
          </button>
        </div>
      </header>

      {serverFilters && (
        <div className="filters filters-server" role="group" aria-label="Catalogue filters">
          <select
            value={popularFilters.language}
            onChange={(e) => updateServerFilter('language', e.target.value)}
            aria-label="Filter by language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code || 'any'} value={l.code}>{l.label}</option>
            ))}
          </select>
          <select
            value={popularFilters.category}
            onChange={(e) => updateServerFilter('category', e.target.value)}
            aria-label="Filter by category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value || 'any'} value={c.value}>{c.label}</option>
            ))}
          </select>
          {(popularFilters.language || popularFilters.category) && (
            <button
              type="button"
              className="btn-link"
              onClick={() => onPopularFiltersChange({ language: '', category: '' })}
              aria-label="Clear catalogue filters"
            >
              Reset
            </button>
          )}
        </div>
      )}

      <div className="filters" role="search">
        <input
          type="search"
          placeholder={externalSearch
            ? 'Search Google Books — title, author, ISBN, anything…'
            : 'Search title, author or ISBN…'}
          value={queryValue}
          onChange={(e) => handleQuery(e.target.value)}
          aria-label="Search books"
          className="filter-search"
        />

        <select
          value={state.status}
          onChange={(e) => set.status(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="lent">Lent</option>
        </select>

        <select
          value={state.author}
          onChange={(e) => set.author(e.target.value)}
          aria-label="Filter by author"
          disabled={authors.length === 0}
        >
          <option value="all">All authors</option>
          {authors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={state.sort}
          onChange={(e) => set.sort(e.target.value)}
          aria-label="Sort by"
        >
          <option value="title-asc">Title A→Z</option>
          <option value="title-desc">Title Z→A</option>
          <option value="author-asc">Author A→Z</option>
          <option value="author-desc">Author Z→A</option>
          <option value="status-asc">Status</option>
        </select>

        {isFiltered && (
          <button
            type="button"
            className="btn-link"
            onClick={() => { if (externalSearch) handleQuery(''); reset(); }}
            aria-label="Clear filters"
          >
            Clear
          </button>
        )}
      </div>

      {matchCount === 0 && !loadingMore ? (
        <div className="empty">
          {externalSearch && queryValue.trim()
            ? <>No results for <strong>"{queryValue}"</strong>. Try a different keyword.</>
            : 'No books match the current filters.'}
        </div>
      ) : viewMode === 'grid' ? (
        <GridView
          books={itemsToRender}
          showCheckbox={showCheckbox}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      ) : (
        <ListView
          books={itemsToRender}
          showCheckbox={showCheckbox}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      )}

      {lazyMode ? (
        <div className="load-more-bar">
          {loadingMore && <span className="muted">Loading more…</span>}
          {hasMore && !loadingMore && (
            <button type="button" className="btn-load-more" onClick={onLoadMore}>
              Load more
            </button>
          )}
          {!hasMore && !loadingMore && filtered.length > 0 && (
            <span className="muted">End of results</span>
          )}
        </div>
      ) : (
        <Pagination
          page={state.page}
          totalPages={totalPages}
          onChange={set.page}
        />
      )}
    </section>
  );
}

/* ─── Sub-views ──────────────────────────────────────────────────────────── */

function GridView({ books, showCheckbox, selected, onToggleSelect }) {
  return (
    <div className="book-grid" role="list">
      {books.map((b) => (
        <article key={b.id} className="book-card" role="listitem">
          {showCheckbox && (
            // Checkbox is positioned absolutely on top of the card; clicking
            // it must NOT trigger navigation, so we stop propagation. The
            // surrounding <Link> handles the rest of the card area.
            <input
              type="checkbox"
              className="book-select"
              checked={selected.has(b.id)}
              onChange={() => onToggleSelect(b.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${b.title}`}
            />
          )}
          <Link
            to={`/book/${encodeURIComponent(b.id)}`}
            state={{ book: b }}
            className="book-card-link"
            aria-label={`Open preview for ${b.title}`}
          >
            <Thumbnail src={b.thumbnail} alt={b.title} />
            <div className="book-card-meta">
              <h3 className="book-title" title={b.title}>{b.title}</h3>
              <p className="book-author muted" title={b.author}>{b.author || 'Unknown'}</p>
              <span className={`badge badge-${b.status}`}>{b.status}</span>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}

function ListView({ books, showCheckbox, selected, onToggleSelect }) {
  return (
    <div className="book-list" role="list">
      {books.map((b) => (
        <article key={b.id} className="book-row" role="listitem">
          {showCheckbox && (
            <input
              type="checkbox"
              className="book-select"
              checked={selected.has(b.id)}
              onChange={() => onToggleSelect(b.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${b.title}`}
            />
          )}
          <Link
            to={`/book/${encodeURIComponent(b.id)}`}
            state={{ book: b }}
            className="book-row-link"
            aria-label={`Open preview for ${b.title}`}
          >
            <Thumbnail src={b.thumbnail} alt={b.title} size="lg" />
            <div className="book-row-meta">
              <h3 className="book-title">{b.title}{b.subtitle ? <span className="muted">: {b.subtitle}</span> : null}</h3>
              <p className="book-author">{b.author || 'Unknown'}</p>
              <div className="book-row-tags">
                <span className={`badge badge-${b.status}`}>{b.status}</span>
                {b.isbn       && <span className="badge badge-soft">ISBN {b.isbn}</span>}
                {b.publisher  && <span className="badge badge-soft">{b.publisher}</span>}
                {b.publishedAt && <span className="badge badge-soft">{b.publishedAt}</span>}
                {b.pageCount  && <span className="badge badge-soft">{b.pageCount} pages</span>}
              </div>
              {b.description && <p className="book-desc">{b.description}</p>}
              {Array.isArray(b.categories) && b.categories.length > 0 && (
                <p className="book-categories muted">{b.categories.slice(0, 4).join(' · ')}</p>
              )}
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}

function Thumbnail({ src, alt, size = 'md' }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <div className={`book-thumb book-thumb-${size} book-thumb-empty`} aria-hidden="true">📖</div>;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`book-thumb book-thumb-${size}`}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}
