/**
 * In-memory store — used for tests and `USE_MEMORY_STORE=true` local dev.
 * Mirrors the async contract of the Catalyst Data Store implementation.
 */
const { v4: uuidv4 } = require('uuid');

let books = new Map();
let loans = new Map();

function reset() {
  books = new Map();
  loans = new Map();
  // seed
  ['The Pragmatic Programmer:Andrew Hunt', 'Clean Code:Robert C. Martin'].forEach((s) => {
    const [title, author] = s.split(':');
    const id = uuidv4();
    books.set(id, {
      id, title, author, status: 'available',
      createdAt: new Date().toISOString()
    });
  });
}
reset();

module.exports = {
  __reset: reset, // test helper

  async list() {
    return Array.from(books.values());
  },

  async get(id) {
    return books.get(id) || null;
  },

  async add({ title, author, isbn }, _ctx) {
    const id = uuidv4();
    const book = {
      id, title, author, isbn: isbn || null,
      status: 'available',
      createdAt: new Date().toISOString()
    };
    books.set(id, book);
    return book;
  },

  async remove(id) {
    const book = books.get(id);
    if (!book) return { error: 'NOT_FOUND' };
    books.delete(id);
    // cascade — close any open loans for this book
    for (const [lid, loan] of loans) {
      if (loan.book_id === id && !loan.returned_at) loans.delete(lid);
    }
    return { book };
  },

  async lend(bookId, borrower) {
    const book = books.get(bookId);
    if (!book) return { error: 'NOT_FOUND' };
    if (book.status === 'lent') return { error: 'ALREADY_LENT' };
    const loanId = uuidv4();
    const now = new Date().toISOString();
    book.status = 'lent';
    loans.set(loanId, {
      id: loanId,
      book_id: bookId,
      borrower_id: borrower.user_id,
      borrower_email: borrower.email_id,
      lent_at: now,
      returned_at: null
    });
    return { book, loanId };
  },

  async returnBook(bookId, user) {
    const book = books.get(bookId);
    if (!book) return { error: 'NOT_FOUND' };
    if (book.status !== 'lent') return { error: 'NOT_LENT' };

    // Find the open loan
    let openLoan = null;
    for (const loan of loans.values()) {
      if (loan.book_id === bookId && !loan.returned_at) { openLoan = loan; break; }
    }
    if (!openLoan) return { error: 'NOT_LENT' };

    const isAdmin = user?.role_details?.role_name === 'admin';
    if (!isAdmin && openLoan.borrower_id !== user?.user_id) {
      return { error: 'NOT_OWNER' };
    }
    openLoan.returned_at = new Date().toISOString();
    book.status = 'available';
    return { book };
  },

  async myLoans(userId) {
    return Array.from(loans.values()).filter(l => l.borrower_id === userId);
  }
};
