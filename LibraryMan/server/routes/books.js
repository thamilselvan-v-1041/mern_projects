const express = require('express');
const router = express.Router();
const store = require('../store');
const { requireAuth, requireRole } = require('../middleware/catalystAuth');
const { addBookSchema, idParamSchema, validate } = require('../validators/bookValidators');

const ctxFrom = (req) => ({ catalystApp: req.catalystApp, user: req.user });

/* ─── /books/popular ────────────────────────────────────────────────────────
 * Paginated public book feed for the home page, used by both the grid and
 * the list view. The client fetches the first 30 immediately, then lazily
 * loads more in 30-book batches as the user scrolls / clicks "Load more".
 *
 *   Query params:
 *     startIndex  (default 0)
 *     size        (default 30, max 30)
 *
 *   Source order:
 *     1. Open Library Search API (free, no API key, generous rate limit)
 *     2. Google Books (kept as alternate via ?source=google, in case OL is down)
 *     3. Curated fallback list (server/seeds/popularBooks.js) on any error
 *
 *   Per-page result cached in-process for 1h to absorb back-and-forth
 *   navigation without re-hitting the upstream.
 */
const { popularWithCovers } = require('../seeds/popularBooks');

const POPULAR_CACHE_TTL_MS = 60 * 60 * 1000;
const popularPageCache = new Map(); // key = `${source}:${startIndex}:${size}` → { at, payload }

async function fetchFromOpenLibrary({ startIndex, size, query }) {
  if (typeof globalThis.fetch !== 'function') throw new Error('fetch missing');
  // sort=editions ≈ popularity (high edition count → frequently reprinted).
  // When the caller supplies an explicit query (search mode), use it verbatim;
  // otherwise default to 'programming' for the popular feed.
  const q = (query && query.trim()) || 'programming';
  const url = 'https://openlibrary.org/search.json'
    + `?q=${encodeURIComponent(q)}`
    + (query ? '' : '&sort=editions')
    + `&limit=${size}`
    + `&offset=${startIndex}`
    + '&fields=key,title,author_name,first_publish_year,isbn,cover_i,subject,publisher';
  const resp = await globalThis.fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LibraryMan/2.0 (demo)' }
  });
  if (!resp.ok) throw new Error(`openlibrary HTTP ${resp.status}`);
  const body = await resp.json();
  const items = (body.docs || []).map((d, idx) => {
    const isbn = Array.isArray(d.isbn) ? d.isbn.find(i => /^\d{10,13}$/.test(i)) : null;
    const thumbnail = d.cover_i
      ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
      : (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : null);
    return {
      id:          d.key || `ol-${startIndex + idx}`,
      title:       d.title || 'Untitled',
      subtitle:    null,
      author:      (d.author_name || []).slice(0, 3).join(', ') || 'Unknown',
      isbn:        isbn || null,
      status:      'available',
      thumbnail,
      publisher:   Array.isArray(d.publisher) ? d.publisher[0] : null,
      publishedAt: d.first_publish_year ? String(d.first_publish_year) : null,
      pageCount:   null,
      categories:  Array.isArray(d.subject) ? d.subject.slice(0, 4) : [],
      description: null
    };
  });
  return { items, total: body.numFound || items.length };
}

async function fetchFromGoogleBooks({ startIndex, size, query }) {
  if (typeof globalThis.fetch !== 'function') throw new Error('fetch missing');
  // When a search query is supplied, use it directly; otherwise default to
  // the CS subject filter that drives the popular feed.
  const q = (query && query.trim()) || 'subject:computers';
  const params = new URLSearchParams({
    q,
    orderBy: 'relevance',
    printType: 'books',
    maxResults: String(size),
    startIndex: String(startIndex),
    projection: 'lite'
  });
  if (process.env.GOOGLE_BOOKS_API_KEY) params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const resp = await globalThis.fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'LibraryMan/2.0 (demo)' }
  });
  if (!resp.ok) throw new Error(`google-books HTTP ${resp.status}`);
  const body = await resp.json();
  const items = (body.items || []).map((item) => {
    const v = item.volumeInfo || {};
    const ids = Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [];
    const isbn13 = ids.find(i => i.type === 'ISBN_13')?.identifier;
    const isbn10 = ids.find(i => i.type === 'ISBN_10')?.identifier;
    const thumbnail = (v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '')
                       .replace(/^http:\/\//, 'https://') || null;
    return {
      id:          item.id,
      title:       v.title || 'Untitled',
      subtitle:    v.subtitle || null,
      author:      (v.authors || []).join(', ') || 'Unknown',
      isbn:        isbn13 || isbn10 || null,
      status:      'available',
      thumbnail,
      publisher:   v.publisher || null,
      publishedAt: v.publishedDate || null,
      pageCount:   v.pageCount || null,
      categories:  v.categories || [],
      description: v.description || null
    };
  });
  return { items, total: body.totalItems || items.length };
}

router.get('/popular', async (req, res, next) => {
  try {
    const startIndex = Math.max(0, parseInt(req.query.startIndex || '0', 10) || 0);
    const size = Math.min(30, Math.max(1, parseInt(req.query.size || '30', 10) || 30));
    // Source priority: explicit query param wins. Default = 'google' so the
    // home page can lazy-load through many batches (Google subject:computers
    // returns thousands). Google → Open Library → curated 30-item list, in
    // that order, on any upstream failure.
    const preferred = (req.query.source || 'google').toLowerCase();

    const cacheKey = `${preferred}:${startIndex}:${size}`;
    const cached = popularPageCache.get(cacheKey);
    if (cached && Date.now() - cached.at < POPULAR_CACHE_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    const all = popularWithCovers();
    const useCurated = async () => ({
      items: all.slice(startIndex, startIndex + size),
      total: all.length
    });

    let fetchers;
    if (preferred === 'google')      fetchers = [['google',      fetchFromGoogleBooks], ['openlibrary', fetchFromOpenLibrary], ['curated', useCurated]];
    else if (preferred === 'openlibrary') fetchers = [['openlibrary', fetchFromOpenLibrary], ['google',      fetchFromGoogleBooks], ['curated', useCurated]];
    else                              fetchers = [['curated',     useCurated]];

    let items, total, source, lastError;
    for (const [name, fn] of fetchers) {
      try {
        const r = await fn({ startIndex, size });
        if (r.items.length) {
          items  = r.items;
          total  = r.total;
          source = name;
          break;
        }
      } catch (e) {
        lastError = `${name}: ${e.message}`;
      }
    }

    if (!items || !items.length) {
      // Absolute last resort
      const r = await useCurated();
      items  = r.items;
      total  = r.total;
      source = `fallback (${lastError || 'no upstream items'})`;
    }

    const payload = {
      success:    true,
      data:       items,
      startIndex,
      size:       items.length,
      total,
      hasMore:    startIndex + items.length < total,
      source,
      cached:     false
    };
    popularPageCache.set(cacheKey, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) { next(err); }
});

/* ─── /books/search ─────────────────────────────────────────────────────────
 * Server-side search across Google Books (preferred) with Open Library as a
 * fallback when Google is unavailable / rate-limited.
 *
 *   GET /books/search?q=<query>&startIndex=<n>&size=<n>
 *     q          required, trimmed; empty → empty result set (200)
 *     startIndex default 0
 *     size       default 30, max 40
 *
 * Same response shape as /books/popular plus a `query` echo. Cached per
 * (q,start,size) for 1h in the shared popularPageCache.
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const startIndex = Math.max(0, parseInt(req.query.startIndex || '0', 10) || 0);
    const size = Math.min(40, Math.max(1, parseInt(req.query.size || '30', 10) || 30));

    if (!q) {
      return res.json({
        success: true, data: [], total: 0, startIndex: 0, size: 0,
        hasMore: false, query: '', source: 'empty', cached: false
      });
    }

    const cacheKey = `search:${q.toLowerCase()}:${startIndex}:${size}`;
    const cached = popularPageCache.get(cacheKey);
    if (cached && Date.now() - cached.at < POPULAR_CACHE_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    let items = [], total = 0, source, lastError;
    const fetchers = [
      ['google',      fetchFromGoogleBooks],
      ['openlibrary', fetchFromOpenLibrary]
    ];
    for (const [name, fn] of fetchers) {
      try {
        const r = await fn({ startIndex, size, query: q });
        if (r.items.length) { items = r.items; total = r.total; source = name; break; }
      } catch (e) {
        lastError = `${name}: ${e.message}`;
      }
    }

    const payload = {
      success:    true,
      data:       items,
      startIndex,
      size:       items.length,
      total,
      hasMore:    items.length > 0 && startIndex + items.length < total,
      query:      q,
      source:     source || `unavailable (${lastError || 'no results'})`,
      cached:     false
    };
    popularPageCache.set(cacheKey, { at: Date.now(), payload });
    res.json(payload);
  } catch (err) { next(err); }
});

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
