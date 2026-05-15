import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import AddBook from './components/AddBook.jsx';
import BookList from './components/BookList.jsx';
import LendBook from './components/LendBook.jsx';
import ReturnBook from './components/ReturnBook.jsx';
import DeleteBook from './components/DeleteBook.jsx';
import { booksApi } from './api/booksApi';
import { useAuth } from './auth/AuthContext';
import SignInGate from './auth/SignInGate.jsx';
import RequireRole from './auth/RequireRole.jsx';
import OAuthCallback from './auth/OAuthCallback.jsx';

export default function App() {
  const { user, loading: authLoading, isAdmin, isAuthenticated, signOut, role, provider } = useAuth();
  const [books, setBooks] = useState([]);                  // Data Store inventory (lend/return)
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [signinOpen, setSigninOpen] = useState(false);

  // Public catalogue for the home page, lazy-loaded in 30-item batches.
  const [popular, setPopular]                   = useState([]);
  const [popularHasMore, setPopularHasMore]     = useState(true);
  const [popularLoading, setPopularLoading]     = useState(false);
  const [popularSource, setPopularSource]       = useState(null);

  // Auto-close the sign-in modal once the user is authenticated
  useEffect(() => { if (isAuthenticated) setSigninOpen(false); }, [isAuthenticated]);

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
    setPopularLoading((isLoading) => {
      // Use a functional setState to read the current loading flag without a
      // stale-closure race when multiple scrolls fire in quick succession.
      if (isLoading) return isLoading;
      return true;
    });
    try {
      const startIndex = popular.length;
      const res = await booksApi.popular(startIndex, 30);
      setPopular((prev) => [...prev, ...(res.data || [])]);
      setPopularHasMore(Boolean(res.hasMore));
      setPopularSource(res.source || null);
    } catch {
      showToast('Failed to load popular books', 'error');
      setPopularHasMore(false);
    } finally {
      setPopularLoading(false);
    }
  }, [popular.length]);

  // Initial loads
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (popular.length === 0 && popularHasMore && !popularLoading) loadMorePopular();
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
              onClick={() => setSigninOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={signinOpen}
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
              books={popular}
              heading="Popular Books"
              hasMore={popularHasMore}
              onLoadMore={loadMorePopular}
              loadingMore={popularLoading}
              source={popularSource}
              showCheckbox={isAuthenticated}
            />
          } />
          <Route path="/auth/callback" element={<OAuthCallback />} />

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

      {signinOpen && !isAuthenticated && (
        <div
          className="signin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signin-title"
          onClick={() => setSigninOpen(false)}
        >
          <div className="signin-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="signin-modal-close"
              onClick={() => setSigninOpen(false)}
              aria-label="Close sign-in"
            >
              ✕
            </button>
            <SignInGate />
          </div>
        </div>
      )}

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
