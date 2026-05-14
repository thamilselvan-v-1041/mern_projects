import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookList from '../components/BookList';

const sample = [
  { id: '1', title: 'Refactoring',              author: 'Martin Fowler', isbn: '978-1', status: 'available' },
  { id: '2', title: 'Clean Code',               author: 'Robert Martin', isbn: '978-2', status: 'lent' },
  { id: '3', title: 'Domain-Driven Design',     author: 'Eric Evans',    isbn: '978-3', status: 'available' },
  { id: '4', title: 'The Pragmatic Programmer', author: 'Dave Thomas',   isbn: null,    status: 'available' }
];

describe('<BookList>', () => {
  it('renders empty state when no books', () => {
    render(<BookList books={[]} />);
    expect(screen.getByText(/No books in the library/i)).toBeInTheDocument();
  });

  it('renders all rows with header count', () => {
    render(<BookList books={sample} />);
    expect(screen.getByRole('heading', { name: /All Books/i })).toBeInTheDocument();
    expect(screen.getByText('(4)')).toBeInTheDocument();
    sample.forEach(b => expect(screen.getByText(b.title)).toBeInTheDocument());
  });

  it('filters by status via the status select', () => {
    render(<BookList books={sample} />);
    fireEvent.change(screen.getByLabelText(/Filter by status/i), { target: { value: 'lent' } });
    expect(screen.getByText('Clean Code')).toBeInTheDocument();
    expect(screen.queryByText('Refactoring')).not.toBeInTheDocument();
    expect(screen.getByText('(1 of 4)')).toBeInTheDocument();
  });

  it('searches across title with debounce', async () => {
    const user = userEvent.setup();
    render(<BookList books={sample} />);
    await user.type(screen.getByLabelText(/Search books/i), 'pragmatic');
    // wait past the 200ms debounce
    await new Promise(r => setTimeout(r, 250));
    expect(screen.getByText('The Pragmatic Programmer')).toBeInTheDocument();
    expect(screen.queryByText('Refactoring')).not.toBeInTheDocument();
  });

  it('shows empty filter state when no books match', async () => {
    const user = userEvent.setup();
    render(<BookList books={sample} />);
    await user.type(screen.getByLabelText(/Search books/i), 'zzznotfound');
    await new Promise(r => setTimeout(r, 250));
    expect(screen.getByText(/No books match the current filters/i)).toBeInTheDocument();
  });

  it('Clear button resets all filters', async () => {
    const user = userEvent.setup();
    render(<BookList books={sample} />);
    fireEvent.change(screen.getByLabelText(/Filter by status/i), { target: { value: 'lent' } });
    expect(screen.getByText('(1 of 4)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(screen.getByText('(4)')).toBeInTheDocument();
  });

  it('renders pagination and navigates pages on large lists', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      title: `Book ${String(i).padStart(2, '0')}`,
      author: 'A',
      isbn: null,
      status: 'available'
    }));
    const user = userEvent.setup();
    render(<BookList books={many} />);

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Book 00')).toBeInTheDocument();
    expect(within(table).queryByText('Book 25')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next page/i }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Book 25')).toBeInTheDocument();
  });
});
