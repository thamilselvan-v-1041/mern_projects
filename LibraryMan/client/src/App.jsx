import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import AddBook from './components/AddBook.jsx';
import BookList from './components/BookList.jsx';
import BookPreview from './components/BookPreview.jsx';
import LendBook from './components/LendBook.jsx';
import ReturnBook from './components/ReturnBook.jsx';
import DeleteBook from './components/DeleteBook.jsx';
import { booksApi } from './api/booksApi';
import { useAuth } from './auth/AuthContext';
import RequireRole from './auth/RequireRole.jsx';
import useDebouncedValue from './hooks/useDebouncedValue';

/**
 * Catalyst Slate hosts a built-in login page at /__catalyst/auth/login under
 * the same origin as the deployed client. Redirecting there hands the entire
 * sign-in/sign-up UX to Catalyst — no in-app modal, no embedded iframe, no
 * federated-provider boilerplate. The URL is derived from window.location
 * at runtime so the same code works locally and across every Slate subdomain
 * Catalyst hands us on redeploy.
 */
function goToCatalystSignIn() {
  if (typeof window === 'undefined') return;
  window.location.assign(`${window.location.origin}/__catalyst/auth/login`);
}

export default function App() {
  const { user, loading: authLoading, isAdmin, isAuthenticated, signOut, role, provider } = useAuth();
  const [books, setBooks] = useState([]);                  // Data Store inventory (lend/return)
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Public catalogue for the home page, lazy-loaded in 30-item batches.
  // `popularFilters` drives the server-side feed (language + category); when
  // either changes we reset the loaded set and refetch from page 0.
  const [popular, setPopular]                   = useState([]);
  const [popularHasMore, setPopularHasMore]     = useState(true);
  const [popularLoading, setPopularLoading]     = useState(false);
  const [popularSource, setPopularSource]       = useState(null);
  const [popularFilters, setPopularFilters]     = useState({ language: '', category: '' });

  // Server-side search (Google Books → Open Library fallback) — replaces the
  // popular feed when the user has a non-empty search query.
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSource,  setSearchSource]  = useState(null);
  const debouncedSearch = useDebouncedValue(searchQuery, 350);
  const isSearching = debouncedSearch.trim().length > 0;

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksApi.list();
      setBooks(res.data || []);
    } catch {
      showToast('Failed to load books', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMorePopular = useCallback(async () => {
    setPopularLoading((isLoading) => isLoading ? isLoading : true);
    try {
      const startIndex = popular.length;
      const res = await booksApi.popular(startIndex, 30, popularFilters);
      setPopular((prev) => [...prev, ...(res.data || [])]);
      setPopularHasMore(Boolean(res.hasMore));
      setPopularSource(res.source || null);
    } catch {
      showToast('Failed to load popular books', 'error');
      setPopularHasMore(false);
    } finally {
      setPopularLoading(false);
    }
  }, [popular.length, popularFilters]);

  // When language or category changes, blow away the loaded set and refetch
  // from page 0 with the new filters. Skip on the very first render because
  // the initial-load effect below also primes the feed.
  const didInitialFetchRef = React.useRef(false);
  useEffect(() => {
    if (!didInitialFetchRef.current) return; // initial load handled separately
    let cancelled = false;
    (async () => {
      setPopularLoading(true);
      try {
        const res = await booksApi.popular(0, 30, popularFilters);
        if (cancelled) return;
        setPopular(res.data || []);
        setPopularHasMore(Boolean(res.hasMore));
        setPopularSource(res.source || null);
      } catch {
        if (!cancelled) {
          showToast('Failed to load popular books', 'error');
          setPopularHasMore(false);
        }
      } finally {
        if (!cancelled) setPopularLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [popularFilters]);

  // Server-side search: fire on debounced query change. A fresh query resets
  // the result list and pagination; an empty query clears everything (we just
  // fall back to the popular feed in render).
  useEffect(() => {
    let cancelled = false;
    const q = debouncedSearch.trim();
    if (!q) {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchSource(null);
      return;
    }
    (async () => {
      setSearchLoading(true);
      try {
        const res = await booksApi.search(q, 0, 30);
        if (cancelled) return;
        setSearchResults(res.data || []);
        setSearchHasMore(Boolean(res.hasMore));
        setSearchSource(res.source || null);
      } catch {
        if (!cancelled) {
          showToast('Search failed', 'error');
          setSearchHasMore(false);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const loadMoreSearch = useCallback(async () => {
    if (searchLoading || !searchHasMore) return;
    const q = debouncedSearch.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const res = await booksApi.search(q, searchResults.length, 30);
      setSearchResults((prev) => [...prev, ...(res.data || [])]);
      setSearchHasMore(Boolean(res.hasMore));
    } catch {
      showToast('Failed to load more search results', 'error');
      setSearchHasMore(false);
    } finally {
      setSearchLoading(false);
    }
  }, [searchLoading, searchHasMore, debouncedSearch, searchResults.length]);

  // Initial loads
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (popular.length === 0 && popularHasMore && !popularLoading) {
      didInitialFetchRef.current = true;
      loadMorePopular();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authLoading) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>📚 LibraryMan</h1>
        <nav>
          {isAuthenticated && <NavLink to="/lend">Lend</NavLink>}
          {isAuthenticated && <NavLink to="/return">Return</NavLink>}
          {isAdmin && <NavLink to="/add">Add</NavLink>}
          {isAdmin && <NavLink to="/delete">Delete</NavLink>}
        </nav>
        <div className="user-chip">
          {isAuthenticated ? (
            <>
              <div className="user-avatar" aria-hidden="true">
                {initialsFor(user)}
              </div>
              <div className="user-info">
                <span className="user-info-name">
                  {user.first_name || user.email_id?.split('@')[0] || 'You'}
                </span>
                <span className="user-info-meta">
                  <span className={`badge badge-${role}`}>{role}</span>
                  {provider && (
                    <span className={`badge badge-provider badge-provider-${provider}`}>{provider}</span>
                  )}
                </span>
              </div>
              <button
                className="btn-signout"
                onClick={signOut}
                aria-label={`Sign out of ${user.email_id || 'account'}`}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              className="btn-signin"
              onClick={goToCatalystSignIn}
              aria-label="Sign in via Catalyst"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <main className="main">
        {loading && <div className="loading">Loading books…</div>}
        <Routes>
          <Route path="/" element={
            <BookList
              books={isSearching ? searchResults : popular}
              heading={isSearching ? `Search: "${debouncedSearch.trim()}"` : 'Popular Books in India'}
              hasMore={isSearching ? searchHasMore : popularHasMore}
              onLoadMore={isSearching ? loadMoreSearch : loadMorePopular}
              loadingMore={isSearching ? searchLoading : popularLoading}
              source={isSearching ? searchSource : popularSource}
              showCheckbox={isAuthenticated}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              popularFilters={isSearching ? null : popularFilters}
              onPopularFiltersChange={isSearching ? null : setPopularFilters}
            />
          } />
          <Route path="/book/:id" element={<BookPreview showToast={showToast} />} />

          <Route path="/lend" element={
            <RequireRole roles={['member', 'admin']}>
              <LendBook books={books} onDone={refresh} showToast={showToast} />
            </RequireRole>
          } />

          <Route path="/return" element={
            <RequireRole roles={['member', 'admin']}>
              <ReturnBook books={books} onDone={refresh} showToast={showToast} />
            </RequireRole>
          } />

          <Route path="/add" element={
            <RequireRole roles={['admin']}>
              <AddBook onDone={refresh} showToast={showToast} />
            </RequireRole>
          } />

          <Route path="/delete" element={
            <RequireRole roles={['admin']}>
              <DeleteBook books={books} onDone={refresh} showToast={showToast} />
            </RequireRole>
          } />
        </Routes>

      </main>

      <footer className="footer">Hosted on Zoho Catalyst · Auth + Data Store</footer>
    </div>
  );
}

function initialsFor(user) {
  if (!user) return '?';
  const name = user.first_name || user.email_id || '';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
