/**
 * LibraryMan — Backend entry point (Catalyst AdvancedIO Node.js function).
 *
 * Security stack:
 *   - helmet            → HTTP hardening headers
 *   - cors              → restricted to Catalyst-hosted origin in prod
 *   - express-rate-limit→ basic abuse mitigation
 *   - joi validators    → input sanitisation per route
 *   - Catalyst auth     → identity (cookie/session) + role-based authz
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const booksRouter = require('./routes/books');
const authRouter  = require('./routes/auth');
const { attachCatalystApp } = require('./middleware/catalystAuth');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ──────────────────────────────────────────────────────────────────
// Catalyst-hosted clients share the project's web-client origin and pass
// session cookies automatically — set ALLOWED_ORIGINS in the function env.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

// ─── Rate limiting (per IP) ────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

// Attach a Catalyst app instance to every request (skipped in mock mode).
app.use(attachCatalystApp);

// ─── Health check (public) ────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    service: 'LibraryMan API',
    version: '2.0.0',
    status: 'running',
    auth: 'Catalyst Authentication',
    endpoints: [
      'GET    /books              (public)',
      'POST   /books              (admin)',
      'POST   /books/:id/lend     (member|admin)',
      'POST   /books/:id/return   (member|admin, own loan)',
      'DELETE /books/:id          (admin)',
      'GET    /books/me/loans     (member|admin)',
      'GET    /auth/providers     (public)',
      'POST   /auth/oauth/authorize (public)',
      'POST   /auth/oauth/exchange  (public)'
    ]
  });
});

app.use('/auth',  authRouter);
app.use('/books', booksRouter);

// ─── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Centralised error handler ────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[LibraryMan] Error:', err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message
  });
});

// ─── Local dev listener ───────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ LibraryMan API on http://localhost:${PORT}` +
      (process.env.USE_MEMORY_STORE === 'true' ? ' (memory store)' : ' (Catalyst Data Store)'));
  });
}

module.exports = app;
