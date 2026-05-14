/**
 * Catalyst Data Store implementation.
 *
 * Tables expected in the Catalyst project (see /server/catalyst-datastore.json):
 *   - Books      (title, author, isbn, status)
 *   - BookLoans  (book_id, borrower_id, borrower_email, lent_at, returned_at)
 *
 * Every method accepts an optional `ctx` containing { catalystApp, user } so
 * we use a *request-scoped* Catalyst app instance (required by the SDK).
 */

function ds(ctx) {
  if (!ctx?.catalystApp) {
    throw new Error('Catalyst app instance missing on request context');
  }
  return ctx.catalystApp.datastore();
}

function mapBookRow(row) {
  if (!row) return null;
  return {
    id: String(row.ROWID || row.Books?.ROWID),
    title:  row.title  ?? row.Books?.title,
    author: row.author ?? row.Books?.author,
    isbn:   row.isbn   ?? row.Books?.isbn ?? null,
    status: row.status ?? row.Books?.status ?? 'available',
    createdAt: row.CREATEDTIME || row.Books?.CREATEDTIME
  };
}

function mapLoanRow(row) {
  if (!row) return null;
  const r = row.BookLoans || row;
  return {
    id: String(r.ROWID),
    book_id: r.book_id,
    borrower_id: r.borrower_id,
    borrower_email: r.borrower_email,
    lent_at: r.lent_at,
    returned_at: r.returned_at || null
  };
}

module.exports = {
  async list(ctx) {
    const rows = await ds(ctx).table('Books').getAllRows();
    return rows.map(mapBookRow);
  },

  async get(id, ctx) {
    try {
      const row = await ds(ctx).table('Books').getRow(id);
      return mapBookRow(row);
    } catch {
      return null;
    }
  },

  async add({ title, author, isbn }, ctx) {
    const row = await ds(ctx).table('Books').insertRow({
      title, author, isbn: isbn || null, status: 'available'
    });
    return mapBookRow(row);
  },

  async remove(id, ctx) {
    const book = await this.get(id, ctx);
    if (!book) return { error: 'NOT_FOUND' };
    await ds(ctx).table('Books').deleteRow(id);

    // Cascade — close any open loans
    const openLoans = await this._openLoansForBook(id, ctx);
    for (const loan of openLoans) {
      await ds(ctx).table('BookLoans').updateRow({
        ROWID: loan.id, returned_at: new Date().toISOString()
      });
    }
    return { book };
  },

  async lend(bookId, borrower, ctx) {
    const book = await this.get(bookId, ctx);
    if (!book) return { error: 'NOT_FOUND' };
    if (book.status === 'lent') return { error: 'ALREADY_LENT' };

    const now = new Date().toISOString();
    const loanRow = await ds(ctx).table('BookLoans').insertRow({
      book_id: bookId,
      borrower_id: String(borrower.user_id),
      borrower_email: borrower.email_id,
      lent_at: now,
      returned_at: null
    });
    await ds(ctx).table('Books').updateRow({ ROWID: bookId, status: 'lent' });

    return { book: { ...book, status: 'lent' }, loanId: mapLoanRow(loanRow).id };
  },

  async returnBook(bookId, user, ctx) {
    const book = await this.get(bookId, ctx);
    if (!book) return { error: 'NOT_FOUND' };
    if (book.status !== 'lent') return { error: 'NOT_LENT' };

    const openLoans = await this._openLoansForBook(bookId, ctx);
    if (openLoans.length === 0) return { error: 'NOT_LENT' };
    const loan = openLoans[0];

    const isAdmin = user?.role_details?.role_name === 'admin';
    if (!isAdmin && loan.borrower_id !== String(user?.user_id)) {
      return { error: 'NOT_OWNER' };
    }

    await ds(ctx).table('BookLoans').updateRow({
      ROWID: loan.id, returned_at: new Date().toISOString()
    });
    await ds(ctx).table('Books').updateRow({ ROWID: bookId, status: 'available' });
    return { book: { ...book, status: 'available' } };
  },

  async myLoans(userId, ctx) {
    const sql = `SELECT * FROM BookLoans WHERE borrower_id = '${String(userId).replace(/'/g, "''")}'`;
    const rows = await ctx.catalystApp.zcql().executeZCQLQuery(sql);
    return rows.map(mapLoanRow);
  },

  async _openLoansForBook(bookId, ctx) {
    const safe = String(bookId).replace(/'/g, "''");
    const sql = `SELECT * FROM BookLoans WHERE book_id = '${safe}' AND returned_at IS NULL`;
    const rows = await ctx.catalystApp.zcql().executeZCQLQuery(sql);
    return rows.map(mapLoanRow);
  }
};
