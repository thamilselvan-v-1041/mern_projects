/**
 * POST /seed/library — one-shot demo data loader.
 *
 *   Requires:  admin auth (Catalyst session OR mock-admin).
 *   Behaviour: idempotent — if the Books table already has ≥ sampleBooks.length
 *              rows it returns { skipped: 'already-seeded' } without touching
 *              the store.
 *   Effect:    inserts the 25 sample books, then marks the first N (default 5)
 *              as currently-lent by inserting open BookLoans rows + updating
 *              the books' status to 'lent'. lent_at values are staggered so
 *              the UI shows varied loan ages.
 *
 *   This route is intentionally NOT a generic admin endpoint — it only
 *   exists for first-run demo population. Remove or feature-flag it before
 *   real use.
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/catalystAuth');
const sampleBooks = require('../seeds/sampleBooks');
const sampleBorrowers = require('../seeds/sampleBorrowers');

router.post('/library',
  requireAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      if (!req.catalystApp) {
        return res.status(503).json({
          success: false,
          error: 'Seed route requires the Catalyst Data Store; not available in mock mode.'
        });
      }

      const ds = req.catalystApp.datastore();
      const booksTable = ds.table('Books');
      const loansTable = ds.table('BookLoans');

      // Idempotency guard — don't double-seed.
      const existing = await booksTable.getAllRows();
      if (existing.length >= sampleBooks.length) {
        return res.json({
          success: true,
          data: {
            skipped: 'already-seeded',
            existing_count: existing.length,
            sample_size: sampleBooks.length
          }
        });
      }

      // 1. Insert the catalog.
      const insertedBooks = [];
      for (const b of sampleBooks) {
        const row = await booksTable.insertRow({
          title:  b.title,
          author: b.author,
          isbn:   b.isbn || null,
          status: 'available'
        });
        insertedBooks.push(row);
      }

      // 2. Lend the first N books to synthetic borrowers, with staggered
      //    lent_at dates (today, -2d, -4d, -6d, -8d …) for a realistic mix.
      const lentCount = Math.min(sampleBorrowers.length, insertedBooks.length);
      const loans = [];
      for (let i = 0; i < lentCount; i++) {
        const book = insertedBooks[i];
        const borrower = sampleBorrowers[i];

        const lentAt = new Date();
        lentAt.setDate(lentAt.getDate() - (i * 2));
        const lentAtIso = lentAt.toISOString();

        await loansTable.insertRow({
          book_id:        String(book.ROWID),
          borrower_id:    borrower.user_id,
          borrower_email: borrower.email_id,
          lent_at:        lentAtIso,
          returned_at:    null
        });
        await booksTable.updateRow({ ROWID: book.ROWID, status: 'lent' });

        loans.push({
          book_title: book.title,
          borrower:   borrower.email_id,
          lent_at:    lentAtIso
        });
      }

      res.status(201).json({
        success: true,
        data: {
          books_inserted: insertedBooks.length,
          loans_created:  loans.length,
          loans
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
