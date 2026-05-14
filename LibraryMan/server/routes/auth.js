/**
 * OAuth sign-in routes for Zoho and Google.
 *
 * Flow:
 *   1. GET  /auth/providers          → enabled providers (public)
 *   2. POST /auth/oauth/authorize    → returns authorize URL + PKCE artifacts
 *                                       (client persists state + verifier)
 *   3. POST /auth/oauth/exchange     → server exchanges code, returns the
 *                                       normalised user profile + a signed
 *                                       session token (mock mode) or hands off
 *                                       to Catalyst (production).
 *
 * In Catalyst-hosted deployments, prefer Catalyst's built-in federated
 * authentication (configured in the Catalyst console) — these routes provide
 * (a) a portable fallback usable in local dev and (b) provider discovery for
 * the UI in both modes.
 */
const express = require('express');
const crypto = require('crypto');
const Joi = require('joi');
const oauth = require('../services/oauthProviders');
const {
  listEnabledProviders,
  isProviderConfigured,
  generateState,
  generateCodeVerifier,
  codeChallengeFor,
  buildAuthorizeUrl
} = oauth;

const router = express.Router();

const isLocalMock = () =>
  process.env.NODE_ENV !== 'production' && process.env.USE_MEMORY_STORE === 'true';

/* ─── Schemas ──────────────────────────────────────────────────────────── */
const authorizeSchema = Joi.object({
  provider: Joi.string().valid('zoho', 'google').required(),
  redirectUri: Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).required()
});

const exchangeSchema = Joi.object({
  provider:     Joi.string().valid('zoho', 'google').required(),
  code:         Joi.string().min(1).max(2048).required(),
  state:        Joi.string().min(1).max(512).required(),
  expectedState: Joi.string().min(1).max(512).required(),
  codeVerifier: Joi.string().min(43).max(128).required(),
  redirectUri:  Joi.string().uri({ scheme: ['http', 'https'] }).max(2048).required()
});

/* ─── GET /auth/providers — public discovery ──────────────────────────── */
router.get('/providers', (_req, res) => {
  res.json({
    success: true,
    data: {
      providers: listEnabledProviders(),
      mock: isLocalMock()
    }
  });
});

/* ─── POST /auth/oauth/authorize — build authorize URL with PKCE ──────── */
router.post('/oauth/authorize', (req, res, next) => {
  try {
    const { value, error } = authorizeSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!isProviderConfigured(value.provider)) {
      return res.status(503).json({ success: false, error: `Provider not configured: ${value.provider}` });
    }
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeFor(codeVerifier);
    const url = buildAuthorizeUrl({
      provider: value.provider,
      redirectUri: value.redirectUri,
      state,
      codeChallenge
    });
    return res.json({
      success: true,
      data: { url, state, codeVerifier, provider: value.provider }
    });
  } catch (err) { next(err); }
});

/* ─── POST /auth/oauth/exchange — finalise sign-in ────────────────────── */
router.post('/oauth/exchange', async (req, res, next) => {
  try {
    const { value, error } = exchangeSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ success: false, error: error.message });

    // Constant-time state comparison
    if (!safeEqual(value.state, value.expectedState)) {
      return res.status(400).json({ success: false, error: 'State mismatch — possible CSRF' });
    }

    const profile = await oauth.exchangeCode({
      provider: value.provider,
      code: value.code,
      codeVerifier: value.codeVerifier,
      redirectUri: value.redirectUri
    });

    // Build the mock session user (local dev). In production Catalyst's own
    // federated SSO handles session establishment; this endpoint then merely
    // confirms a successful round-trip.
    const role = mapEmailToRole(profile.email);
    const sessionUser = {
      user_id: `${profile.provider}-${profile.sub}`,
      email_id: profile.email,
      first_name: profile.name.split(' ')[0] || profile.email,
      last_name:  profile.name.split(' ').slice(1).join(' ') || '',
      provider: profile.provider,
      role_details: { role_name: role }
    };

    return res.json({ success: true, data: { user: sessionUser } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

/* ─── helpers ──────────────────────────────────────────────────────────── */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function mapEmailToRole(email) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(String(email).toLowerCase()) ? 'admin' : 'member';
}

module.exports = router;
