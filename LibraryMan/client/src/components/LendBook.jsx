import React, { useState } from 'react';
import { booksApi } from '../api/booksApi';
import { useAuth } from '../auth/AuthContext';

export default function LendBook({ books, onDone, showToast }) {
  const { user } = useAuth();
  const available = books.filter(b => b.status === 'available');
  const [bookId, setBookId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookId) {
      showToast('Select a book to lend', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await booksApi.lend(bookId);
      showToast('Book lent out 📖', 'success');
      setBookId('');
      onDone();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Failed to lend book', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card">
      <h2>Lend a Book</h2>
      <p className="muted">
        Borrowing as <strong>{user?.email_id || user?.first_name}</strong>
      </p>
      {available.length === 0 ? (
        <p className="empty">No books available to lend right now.</p>
      ) : (
        <form onSubmit={handleSubmit} className="form">
          <label>
            Book
            <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">-- choose a book --</option>
              {available.map(b => (
                <option key={b.id} value={b.id}>{b.title} — {b.author}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Lending…' : 'Lend Book'}
          </button>
        </form>
      )}
    </section>
  );
}
