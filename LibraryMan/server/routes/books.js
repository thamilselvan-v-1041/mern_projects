const express = require('express');
const router = express.Router();
const store = require('../store');
const { requireAuth, requireRole } = require('../middleware/catalystAuth');
const { addBookSchema, idParamSchema, validate } = require('../validators/bookValidators');

const ctxFrom = (req) => ({ catalystApp: req.catalystApp, user: req.user });

/** Public — anyone can browse the catalog. */
router.get('/', async (req, res, next) => {
  try {
    const data = await store.list(ctxFrom(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

/** Admin only — add a new book. */
router.post('/',
  requireAuth,
  requireRole('admin'),
  validate(addBookSchema, 'body'),
  async (req, res, next) => {
    try {
      const book = await store.add(req.body, ctxFrom(req));
      res.status(201).json({ success: true, data: book });
    } catch (err) { next(err); }
  }
);

/** Admin only — delete a book. */
router.delete('/:id',
  requireAuth,
  requireRole('admin'),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await store.remove(req.params.id, ctxFrom(req));
      if (result.error === 'NOT_FOUND')
        return res.status(404).json({ success: false, error: 'Book not found' });
      res.json({ success: true, data: result.book });
    } catch (err) { next(err); }
  }
);

/** Members + admins — lend a book to the authenticated user. */
router.post('/:id/lend',
  requireAuth,
  requireRole('member', 'admin'),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await store.lend(req.params.id, req.user, ctxFrom(req));
      if (result.error === 'NOT_FOUND')
        return res.status(404).json({ success: false, error: 'Book not found' });
      if (result.error === 'ALREADY_LENT')
        return res.status(409).json({ success: false, error: 'Book is already lent out' });
      res.json({ success: true, data: result.book });
    } catch (err) { next(err); }
  }
);

/** Members (own loans) + admins (any) — return a book. */
router.post('/:id/return',
  requireAuth,
  requireRole('member', 'admin'),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await store.returnBook(req.params.id, req.user, ctxFrom(req));
      if (result.error === 'NOT_FOUND')
        return res.status(404).json({ success: false, error: 'Book not found' });
      if (result.error === 'NOT_LENT')
        return res.status(409).json({ success: false, error: 'Book is not currently lent' });
      if (result.error === 'NOT_OWNER')
        return res.status(403).json({ success: false, error: 'You can only return books you borrowed' });
      res.json({ success: true, data: result.book });
    } catch (err) { next(err); }
  }
);

/** Authenticated user — list their own loans. */
router.get('/me/loans',
  requireAuth,
  requireRole('member', 'admin'),
  async (req, res, next) => {
    try {
      const data = await store.myLoans(req.user.user_id, ctxFrom(req));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

module.exports = router;
