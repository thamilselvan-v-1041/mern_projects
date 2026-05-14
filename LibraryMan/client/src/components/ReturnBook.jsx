import React, { useEffect, useState, useCallback } from 'react';
import { booksApi } from '../api/booksApi';
import { useAuth } from '../auth/AuthContext';

export default function ReturnBook({ books, onDone, showToast }) {
  const { isAdmin } = useAuth();
  const [myLoans, setMyLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);

  const loadLoans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksApi.myLoans();
      setMyLoans(res.data.filter(l => !l.returned_at));
    } catch (err) {
      showToast(err.message || 'Failed to load your loans', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadLoans(); }, [loadLoans]);

  // Admins see all currently-lent books; members see only their own loans
  const lentBooks = books.filter(b => b.status === 'lent');
  const visibleBooks = isAdmin
    ? lentBooks
    : lentBooks.filter(b => myLoans.some(l => l.book_id === b.id));

  const handleReturn = async (id) => {
    setSubmittingId(id);
    try {
      await booksApi.return(id);
      showToast('Book returned ↩️', 'success');
      await loadLoans();
      onDone();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Failed to return book', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <section className="card">
      <h2>Return a Book</h2>
      {!isAdmin && (
        <p className="muted">Showing only books you borrowed.</p>
      )}
      {loading && <p className="loading">Loading your loans…</p>}
      {visibleBooks.length === 0 ? (
        <p className="empty">
          {isAdmin ? 'No books are currently lent out.' : 'You haven\'t borrowed any books.'}
        </p>
      ) : (
        <ul className="list">
          {visibleBooks.map(b => (
            <li key={b.id}>
              <div>
                <strong>{b.title}</strong> — {b.author}
              </div>
              <button onClick={() => handleReturn(b.id)} disabled={submittingId === b.id}>
                {submittingId === b.id ? 'Returning…' : 'Return'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
