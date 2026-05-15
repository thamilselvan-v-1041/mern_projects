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
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

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

  useEffect(() => { refresh(); }, [refresh]);

  if (authLoading) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>📚 LibraryMan</h1>
        <nav>
          <NavLink to="/" end>Books</NavLink>
          {isAuthenticated && <NavLink to="/lend">Lend</NavLink>}
          {isAuthenticated && <NavLink to="/return">Return</NavLink>}
          {isAdmin && <NavLink to="/add">Add</NavLink>}
          {isAdmin && <NavLink to="/delete">Delete</NavLink>}
        </nav>
        <div className="user-chip">
          {isAuthenticated ? (
            <>
              <span className="muted">
                {user.email_id || user.first_name}{' '}
                <span className={`badge badge-${role}`}>{role}</span>
                {provider && <span className={`badge badge-provider badge-provider-${provider}`}>{provider}</span>}
              </span>
              <button className="btn-link" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <span className="muted">Not signed in</span>
          )}
        </div>
      </header>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <main className="main">
        {loading && <div className="loading">Loading books…</div>}
        <Routes>
          <Route path="/" element={<BookList books={books} defaultStatus="available" />} />
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

        {!isAuthenticated && !window.location.pathname.startsWith('/auth/callback') && <SignInGate />}
      </main>

      <footer className="footer">Hosted on Zoho Catalyst · Auth + Data Store</footer>
    </div>
  );
}
