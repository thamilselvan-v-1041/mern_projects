import React from 'react';

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const go = p => () => onChange(Math.max(1, Math.min(totalPages, p)));

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={go(page - 1)} disabled={page === 1} aria-label="Previous page">‹ Prev</button>
      <span className="muted" aria-live="polite">Page {page} of {totalPages}</span>
      <button type="button" onClick={go(page + 1)} disabled={page === totalPages} aria-label="Next page">Next ›</button>
    </nav>
  );
}
