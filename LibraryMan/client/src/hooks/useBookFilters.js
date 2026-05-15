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

  const authors = useMemo(() => {
    const set = new Set();
    for (const b of books) if (b.author) set.add(b.author);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
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
    if (author !== 'all') out = out.filter(b => b.author === author);

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
