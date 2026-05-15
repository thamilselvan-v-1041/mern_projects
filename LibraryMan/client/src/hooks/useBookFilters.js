import { useMemo, useState } from 'react';
import useDebouncedValue from './useDebouncedValue';

export const PAGE_SIZE = 25;

const SORTERS = {
  'title-asc':  (a, b) => a.title.localeCompare(b.title),
  'title-desc': (a, b) => b.title.localeCompare(a.title),
  'author-asc': (a, b) => (a.author || '').localeCompare(b.author || ''),
  'author-desc': (a, b) => (b.author || '').localeCompare(a.author || ''),
  'status-asc': (a, b) => a.status.localeCompare(b.status)
};

/**
 * Encapsulates search/filter/sort/paginate state for a book list.
 * All filtering is in-memory and O(n) per keystroke; cheap up to ~10k rows.
 */
export default function useBookFilters(books, { pageSize = PAGE_SIZE, initialStatus = 'all', skipQuery = false } = {}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus); // all | available | lent
  const [author, setAuthor] = useState('all');
  const [sort, setSort] = useState('title-asc');
  const [page, setPage] = useState(1);

  // When the caller drives search externally (server-side query → /books/search),
  // skip client-side query filtering — the books prop is already the result set.
  const debouncedQuery = useDebouncedValue(query, 200);

  // De-dupe authors using the same normalization as the filter so a single
  // "William Shakespeare" can't appear twice (e.g. one with a trailing
  // space and one without). We keep the *first-seen* original casing as
  // the display label so the dropdown reads naturally.
  const authors = useMemo(() => {
    const seen = new Map(); // normalized key → first-seen display value
    for (const b of books) {
      if (!b.author) continue;
      const key = String(b.author).trim().toLowerCase().replace(/\s+/g, ' ');
      if (key && !seen.has(key)) seen.set(key, b.author.trim());
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [books]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    let out = books;

    if (q && !skipQuery) {
      out = out.filter(b =>
        (b.title  && b.title.toLowerCase().includes(q)) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.isbn   && b.isbn.toLowerCase().includes(q))
      );
    }
    if (status !== 'all') out = out.filter(b => b.status === status);
    if (author !== 'all') {
      // Normalize whitespace + casing on both sides so trivial drift in
      // upstream data (e.g. a stray nbsp or mixed case) doesn't make the
      // dropdown selection silently drop every row.
      const target = author.trim().toLowerCase().replace(/\s+/g, ' ');
      out = out.filter(b => {
        if (!b.author) return false;
        const a = String(b.author).trim().toLowerCase().replace(/\s+/g, ' ');
        return a === target;
      });
    }

    const sorter = SORTERS[sort] || SORTERS['title-asc'];
    // copy before sort — never mutate caller's array
    return [...out].sort(sorter);
  }, [books, debouncedQuery, status, author, sort, skipQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );

  const reset = () => {
    setQuery(''); setStatus(initialStatus); setAuthor('all'); setSort('title-asc'); setPage(1);
  };

  // any filter mutation should snap back to page 1
  const set = {
    query: v => { setQuery(v);   setPage(1); },
    status: v => { setStatus(v); setPage(1); },
    author: v => { setAuthor(v); setPage(1); },
    sort:   v => { setSort(v);   setPage(1); },
    page:   setPage
  };

  return {
    state: { query, status, author, sort, page: safePage },
    authors,
    filtered,
    pageItems,
    totalPages,
    totalCount: books.length,
    matchCount: filtered.length,
    set,
    reset
  };
}
