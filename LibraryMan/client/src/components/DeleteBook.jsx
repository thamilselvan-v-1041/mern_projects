import React, { useState } from 'react';
import { booksApi } from '../api/booksApi';

export default function DeleteBook({ books, onDone, showToast }) {
  const [submittingId, setSubmittingId] = useState(null);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setSubmittingId(id);
    try {
      await booksApi.remove(id);
      showToast('Book deleted 🗑️', 'success');
      onDone();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete book', 'error');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <section className="card">
      <h2>Delete a Book</h2>
      {books.length === 0 ? (
        <p className="empty">No books to delete.</p>
      ) : (
        <ul className="list">
          {books.map(b => (
            <li key={b.id}>
              <div>
                <strong>{b.title}</strong> — {b.author}
                <div className="muted">Status: {b.status}</div>
              </div>
              <button
                className="btn-danger"
                onClick={() => handleDelete(b.id, b.title)}
                disabled={submittingId === b.id}
              >
                {submittingId === b.id ? 'Deleting…' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
