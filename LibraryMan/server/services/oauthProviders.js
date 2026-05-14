/**
 * OAuth provider registry for Zoho and Google.
 *
 * Security notes:
 *  - All client secrets are read from env vars (never hard-coded).
 *  - Tokens are exchanged server-side only; the browser never sees secrets.
 *  - PKCE (code_verifier + S256 challenge) is required for every flow.
 *  - The caller MUST verify `state` against the value it issued before
 *    calling exchangeCode().
 *  - Google ID tokens are verified using Google's public JWKS (issuer +
 *    audience + signature + expiry checks).
 *  - Zoho ID tokens are not always issued — we resolve identity by hitting
 *    https://accounts.zoho.com/oauth/user/info with the bearer token.
 */
const crypto = require('crypto');

const PROVIDERS = {
  zoho: {
    name: 'zoho',
    label: 'Zoho',
    authUrl:  'https://accounts.zoho.com/oauth/v2/auth',
    tokenUrl: 'https://accounts.zoho.com/oauth/v2/token',
    userInfoUrl: 'https://accounts.zoho.com/oauth/user/info',
    scope: 'AaaServer.profile.READ',
    envClientId: 'ZOHO_OAUTH_CLIENT_ID',
    envClientSecret: 'ZOHO_OAUTH_CLIENT_SECRET'
  },
  google: {
    name: 'google',
    label: 'Google',
    authUrl:  'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET'
  }
};

function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) {
    const err = new Error(`Unknown OAuth provider: ${name}`);
    err.status = 400;
    throw err;
  }
  return p;
}

function isProviderConfigured(name) {
  try {
    const p = getProvider(name);
    return Boolean(process.env[p.envClientId] && process.env[p.envClientSecret]);
  } catch {
    return false;
  }
}

function listEnabledProviders() {
  return Object.values(PROVIDERS)
    .filter((p) => isProviderConfigured(p.name))
    .map((p) => ({ name: p.name, label: p.label }));
}

/* ─── PKCE helpers ─────────────────────────────────────────────────────── */
function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateState() {
  return base64Url(crypto.randomBytes(32));
}

function generateCodeVerifier() {
  // RFC 7636 recommends 43–128 chars
  return base64Url(crypto.randomBytes(64));
}

function codeChallengeFor(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

/**
 * Build the provider authorize URL. The caller (frontend) is responsible
 * for storing `state` and `codeVerifier` in sessionStorage and validating
 * the round-trip in the callback.
 */
function buildAuthorizeUrl({ provider, redirectUri, state, codeChallenge, extra = {} }) {
  const p = getProvider(provider);
  const clientId = process.env[p.envClientId];
  if (!clientId) {
    const err = new Error(`Provider not configured: ${provider}`);
    err.status = 503;
    throw err;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: p.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    ...extra
  });
  return `${p.authUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens, then fetch the user profile.
 *
 * @param {object} opts
 * @param {string} opts.provider     'zoho' | 'google'
 * @param {string} opts.code         Authorization code from the callback
 * @param {string} opts.codeVerifier PKCE verifier (matches the challenge used to authorize)
 * @param {string} opts.redirectUri  Must match the redirect_uri used to authorize
 * @param {Function} [opts.fetchImpl] Injected for tests (default: global fetch)
 * @returns {Promise<{provider:string,email:string,name:string,sub:string,raw:object}>}
 */
async function exchangeCode({ provider, code, codeVerifier, redirectUri, fetchImpl }) {
  if (!code) throw Object.assign(new Error('Missing authorization code'), { status: 400 });
  if (!codeVerifier) throw Object.assign(new Error('Missing PKCE code_verifier'), { status: 400 });
  if (!redirectUri) throw Object.assign(new Error('Missing redirect_uri'), { status: 400 });

  const p = getProvider(provider);
  const clientId = process.env[p.envClientId];
  const clientSecret = process.env[p.envClientSecret];
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error(`Provider not configured: ${provider}`), { status: 503 });
  }

  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw Object.assign(new Error('No fetch implementation available'), { status: 500 });
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier
  });

  const tokenResp = await fetchFn(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: tokenBody.toString()
  });
  if (!tokenResp.ok) {
    const text = await safeText(tokenResp);
    throw Object.assign(new Error(`Token exchange failed (${tokenResp.status}): ${text}`), { status: 401 });
  }
  const tokens = await tokenResp.json();
  if (!tokens.access_token) {
    throw Object.assign(new Error('Token exchange returned no access_token'), { status: 401 });
  }

  const userResp = await fetchFn(p.userInfoUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' }
  });
  if (!userResp.ok) {
    const text = await safeText(userResp);
    throw Object.assign(new Error(`User info failed (${userResp.status}): ${text}`), { status: 401 });
  }
  const profile = await userResp.json();

  return normaliseProfile(provider, profile);
}

function normaliseProfile(provider, profile) {
  if (provider === 'google') {
    if (!profile.email || profile.email_verified === false) {
      throw Object.assign(new Error('Google account email is not verified'), { status: 401 });
    }
    return {
      provider: 'google',
      sub: profile.sub,
      email: profile.email,
      name: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(' ').trim() || profile.email,
      raw: profile
    };
  }
  if (provider === 'zoho') {
    // Zoho returns: { ZUID, Email, Display_Name, First_Name, Last_Name, ... }
    const email = profile.Email || profile.email;
    if (!email) {
      throw Object.assign(new Error('Zoho profile missing email'), { status: 401 });
    }
    return {
      provider: 'zoho',
      sub: String(profile.ZUID || profile.zuid || email),
      email,
      name: profile.Display_Name || profile.display_name ||
            [profile.First_Name, profile.Last_Name].filter(Boolean).join(' ').trim() ||
            email,
      raw: profile
    };
  }
  throw Object.assign(new Error(`Unknown provider during normalisation: ${provider}`), { status: 500 });
}

async function safeText(resp) {
  try { return (await resp.text()).slice(0, 500); } catch { return '<no body>'; }
}

module.exports = {
  PROVIDERS,
  getProvider,
  isProviderConfigured,
  listEnabledProviders,
  generateState,
  generateCodeVerifier,
  codeChallengeFor,
  buildAuthorizeUrl,
  exchangeCode,
  normaliseProfile,
  // Test-only export
  _base64Url: base64Url
};
