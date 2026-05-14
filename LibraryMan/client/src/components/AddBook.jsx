import React, { useState } from 'react';
import { booksApi } from '../api/booksApi';

export default function AddBook({ onDone, showToast }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !author.trim()) {
      showToast('Title and author are required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await booksApi.add({ title, author, isbn: isbn || undefined });
      showToast('Book added ✅', 'success');
      setTitle(''); setAuthor(''); setIsbn('');
      onDone();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Failed to add book', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card">
      <h2>Add a New Book</h2>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Atomic Habits" />
        </label>
        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. James Clear" />
        </label>
        <label>
          ISBN <span className="muted">(optional)</span>
          <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-…" />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Book'}
        </button>
      </form>
    </section>
  );
}
