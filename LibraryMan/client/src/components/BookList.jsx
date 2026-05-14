import React from 'react';
import useBookFilters from '../hooks/useBookFilters';
import Pagination from './Pagination.jsx';

export default function BookList({ books = [] }) {
  const {
    state, authors, pageItems, totalPages, totalCount, matchCount, set, reset
  } = useBookFilters(books);

  const isFiltered =
    state.query.trim() !== '' ||
    state.status !== 'all' ||
    state.author !== 'all' ||
    state.sort !== 'title-asc';

  if (!totalCount) {
    return <div className="empty">No books in the library yet.</div>;
  }

  return (
    <section className="card">
      <header className="list-header">
        <h2>
          All Books{' '}
          <span className="muted">
            ({matchCount}{matchCount !== totalCount ? ` of ${totalCount}` : ''})
          </span>
        </h2>
      </header>

      <div className="filters" role="search">
        <input
          type="search"
          placeholder="Search title, author or ISBN…"
          value={state.query}
          onChange={e => set.query(e.target.value)}
          aria-label="Search books"
          className="filter-search"
        />

        <select
          value={state.status}
          onChange={e => set.status(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="lent">Lent</option>
        </select>

        <select
          value={state.author}
          onChange={e => set.author(e.target.value)}
          aria-label="Filter by author"
          disabled={authors.length === 0}
        >
          <option value="all">All authors</option>
          {authors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={state.sort}
          onChange={e => set.sort(e.target.value)}
          aria-label="Sort by"
        >
          <option value="title-asc">Title A→Z</option>
          <option value="title-desc">Title Z→A</option>
          <option value="author-asc">Author A→Z</option>
          <option value="author-desc">Author Z→A</option>
          <option value="status-asc">Status</option>
        </select>

        {isFiltered && (
          <button type="button" className="btn-link" onClick={reset} aria-label="Clear filters">
            Clear
          </button>
        )}
      </div>

      {matchCount === 0 ? (
        <div className="empty">No books match the current filters.</div>
      ) : (
        <table className="book-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>ISBN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(b => (
              <tr key={b.id}>
                <td>{b.title}</td>
                <td>{b.author}</td>
                <td>{b.isbn || '—'}</td>
                <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={state.page}
        totalPages={totalPages}
        onChange={set.page}
      />
    </section>
  );
}
