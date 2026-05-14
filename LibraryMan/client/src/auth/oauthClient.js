/**
 * OAuth client helpers (Zoho / Google) — browser side.
 *
 * Responsibilities:
 *   - PKCE generation (state + code_verifier + S256 challenge) using WebCrypto
 *   - Stash state + verifier in sessionStorage keyed by state for round-trip
 *   - Kick off the redirect to the provider's authorize URL (returned by API)
 *   - On callback, validate state and POST {code, state, expectedState,
 *     codeVerifier, redirectUri} to /auth/oauth/exchange
 *
 * Mock mode: short-circuits the network round-trip and writes a synthetic
 * user (provider-tagged) into localStorage so the UI can be driven in tests.
 */
import axios from 'axios';
import { isMockMode } from './catalystAuth';

const baseURL = import.meta.env.VITE_API_BASE || '/api';
const SS_PREFIX = 'libraryman.oauth.';
const MOCK_KEY = 'libraryman.mockUser';

/* ─── PKCE primitives (WebCrypto) ─────────────────────────────────────── */
function base64Url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  (globalThis.crypto || window.crypto).getRandomValues(out);
  return out;
}

export function generateState() {
  return base64Url(randomBytes(32));
}

export function generateCodeVerifier() {
  return base64Url(randomBytes(64));
}

export async function codeChallengeFor(verifier) {
  const enc = new TextEncoder().encode(verifier);
  const digest = await (globalThis.crypto || window.crypto).subtle.digest('SHA-256', enc);
  return base64Url(new Uint8Array(digest));
}

/* ─── Session storage helpers ─────────────────────────────────────────── */
function stash(state, payload) {
  sessionStorage.setItem(SS_PREFIX + state, JSON.stringify(payload));
}
function pop(state) {
  const key = SS_PREFIX + state;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);
  try { return JSON.parse(raw); } catch { return null; }
}

/* ─── Public API ──────────────────────────────────────────────────────── */
export async function listProviders() {
  if (isMockMode()) {
    return { providers: [{ name: 'zoho', label: 'Zoho' }, { name: 'google', label: 'Google' }], mock: true };
  }
  const r = await axios.get(`${baseURL}/auth/providers`);
  return r.data.data;
}

/**
 * Begin an OAuth flow. In production this redirects the browser to the
 * provider's authorize URL. In mock mode it synthesises a signed-in user.
 *
 * @param {'zoho'|'google'} provider
 * @param {string} redirectUri  e.g. window.location.origin + '/auth/callback'
 */
export async function beginOAuth(provider, redirectUri) {
  if (isMockMode()) {
    const role = provider === 'zoho' ? 'admin' : 'member'; // arbitrary mock mapping
    const user = mockSignInWithProvider(provider, role);
    return { mock: true, user };
  }

  const r = await axios.post(`${baseURL}/auth/oauth/authorize`,
    { provider, redirectUri });
  const { url, state, codeVerifier } = r.data.data;
  stash(state, { provider, codeVerifier, redirectUri });
  window.location.assign(url);
  return { mock: false };
}

/**
 * Complete an OAuth flow from the callback page. Reads `code` + `state` from
 * the current URL, validates state, and POSTs to /auth/oauth/exchange.
 *
 * @returns {Promise<{user:object}>}
 */
export async function completeOAuth(searchString = window.location.search) {
  const qs = new URLSearchParams(searchString);
  const code = qs.get('code');
  const state = qs.get('state');
  const err = qs.get('error');
  if (err) throw new Error(`Provider returned error: ${err}`);
  if (!code || !state) throw new Error('Missing code or state in callback URL');

  const stashed = pop(state);
  if (!stashed) throw new Error('State mismatch — possible CSRF or expired session');

  const r = await axios.post(`${baseURL}/auth/oauth/exchange`, {
    provider: stashed.provider,
    code,
    state,
    expectedState: state,
    codeVerifier: stashed.codeVerifier,
    redirectUri: stashed.redirectUri
  });
  const user = r.data?.data?.user;
  if (!user) throw new Error('Exchange returned no user');

  // Persist for the mock-aware API client (so x-mock-user header is sent).
  localStorage.setItem(MOCK_KEY, JSON.stringify(user));
  return { user };
}

/* ─── Mock helper ─────────────────────────────────────────────────────── */
export function mockSignInWithProvider(provider, role = 'member') {
  const user = {
    user_id: `${provider}-mock-${role}`,
    email_id: `${role}@${provider}.local`,
    first_name: capitalise(role),
    last_name: capitalise(provider),
    provider,
    role_details: { role_name: role }
  };
  localStorage.setItem(MOCK_KEY, JSON.stringify(user));
  return user;
}

function capitalise(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
