import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useBookFilters from '../hooks/useBookFilters';

const sample = [
  { id: '1', title: 'Refactoring',          author: 'Martin Fowler', isbn: '978-1', status: 'available' },
  { id: '2', title: 'Clean Code',           author: 'Robert Martin', isbn: '978-2', status: 'lent' },
  { id: '3', title: 'Domain-Driven Design', author: 'Eric Evans',    isbn: '978-3', status: 'available' },
  { id: '4', title: 'The Pragmatic Programmer', author: 'Dave Thomas', isbn: null,  status: 'available' }
];

describe('useBookFilters', () => {
  it('returns all books sorted by title ascending by default', () => {
    const { result } = renderHook(() => useBookFilters(sample));
    expect(result.current.matchCount).toBe(4);
    expect(result.current.pageItems.map(b => b.title)).toEqual([
      'Clean Code',
      'Domain-Driven Design',
      'Refactoring',
      'The Pragmatic Programmer'
    ]);
  });

  it('filters by status', () => {
    const { result } = renderHook(() => useBookFilters(sample));
    act(() => result.current.set.status('lent'));
    expect(result.current.matchCount).toBe(1);
    expect(result.current.pageItems[0].title).toBe('Clean Code');
  });

  it('filters by author', () => {
    const { result } = renderHook(() => useBookFilters(sample));
    act(() => result.current.set.author('Eric Evans'));
    expect(result.current.pageItems.map(b => b.title)).toEqual(['Domain-Driven Design']);
  });

  it('search is case-insensitive across title, author and isbn', async () => {
    const { result } = renderHook(() => useBookFilters(sample));

    // title
    act(() => result.current.set.query('REFACT'));
    await act(() => new Promise(r => setTimeout(r, 250)));
    expect(result.current.pageItems.map(b => b.title)).toEqual(['Refactoring']);

    // author
    act(() => result.current.set.query('martin'));
    await act(() => new Promise(r => setTimeout(r, 250)));
    expect(result.current.matchCount).toBe(2); // Martin Fowler + Robert Martin

    // isbn
    act(() => result.current.set.query('978-3'));
    await act(() => new Promise(r => setTimeout(r, 250)));
    expect(result.current.pageItems.map(b => b.title)).toEqual(['Domain-Driven Design']);
  });

  it('sort=author-desc sorts by author descending', () => {
    const { result } = renderHook(() => useBookFilters(sample));
    act(() => result.current.set.sort('author-desc'));
    expect(result.current.pageItems.map(b => b.author)).toEqual([
      'Robert Martin', 'Martin Fowler', 'Eric Evans', 'Dave Thomas'
    ]);
  });

  it('paginates large lists and clamps page when out of range', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      title: `Book ${String(i).padStart(2, '0')}`,
      author: 'A',
      isbn: null,
      status: 'available'
    }));
    const { result } = renderHook(() => useBookFilters(many, { pageSize: 25 }));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toHaveLength(25);
    expect(result.current.pageItems[0].title).toBe('Book 00');

    act(() => result.current.set.page(3));
    expect(result.current.pageItems).toHaveLength(10);
    expect(result.current.pageItems[0].title).toBe('Book 50');

    // request page far beyond range — should clamp to last page
    act(() => result.current.set.page(99));
    expect(result.current.state.page).toBe(3);
  });

  it('changing a filter snaps back to page 1', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i), title: `Book ${i}`, author: 'A', isbn: null, status: 'available'
    }));
    const { result } = renderHook(() => useBookFilters(many, { pageSize: 25 }));
    act(() => result.current.set.page(3));
    expect(result.current.state.page).toBe(3);
    act(() => result.current.set.status('lent'));
    expect(result.current.state.page).toBe(1);
  });

  it('reset() clears all filters', async () => {
    const { result } = renderHook(() => useBookFilters(sample));
    act(() => {
      result.current.set.query('clean');
      result.current.set.status('lent');
      result.current.set.author('Robert Martin');
      result.current.set.sort('author-desc');
    });
    await act(() => new Promise(r => setTimeout(r, 250)));
    act(() => result.current.reset());
    // wait for the debounced query to flush after reset
    await act(() => new Promise(r => setTimeout(r, 250)));
    expect(result.current.state).toEqual({
      query: '', status: 'all', author: 'all', sort: 'title-asc', page: 1
    });
    expect(result.current.matchCount).toBe(4);
  });

  it('does not mutate the input array', () => {
    const input = [...sample];
    const snapshot = input.map(b => b.id);
    renderHook(() => useBookFilters(input));
    expect(input.map(b => b.id)).toEqual(snapshot);
  });

  it('authors list is unique and sorted', () => {
    const { result } = renderHook(() => useBookFilters(sample));
    expect(result.current.authors).toEqual([
      'Dave Thomas', 'Eric Evans', 'Martin Fowler', 'Robert Martin'
    ]);
  });
});
