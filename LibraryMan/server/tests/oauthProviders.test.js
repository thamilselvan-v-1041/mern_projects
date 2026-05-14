const {
  generateState,
  generateCodeVerifier,
  codeChallengeFor,
  buildAuthorizeUrl,
  exchangeCode,
  normaliseProfile,
  isProviderConfigured,
  listEnabledProviders,
  getProvider,
  _base64Url
} = require('../services/oauthProviders');

const crypto = require('crypto');

/* ─── PKCE primitives ─────────────────────────────────────────────────── */
describe('PKCE primitives', () => {
  it('generateState produces 32+ char URL-safe strings', () => {
    const s = generateState();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateState()).not.toBe(generateState());
  });

  it('generateCodeVerifier respects RFC 7636 length bounds', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('codeChallengeFor matches the S256 spec', () => {
    const verifier = 'fixed-verifier-for-testing-1234567890ABCDEF';
    const expected = crypto.createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(codeChallengeFor(verifier)).toBe(expected);
  });

  it('_base64Url strips padding and replaces +//', () => {
    expect(_base64Url(Buffer.from('foo>?'))).toBe('Zm9vPj8');
  });
});

/* ─── Provider config / discovery ─────────────────────────────────────── */
describe('Provider configuration', () => {
  const origEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('isProviderConfigured is false when env vars missing', () => {
    delete process.env.ZOHO_OAUTH_CLIENT_ID;
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET;
    expect(isProviderConfigured('zoho')).toBe(false);
  });

  it('isProviderConfigured is true when both env vars set', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    expect(isProviderConfigured('google')).toBe(true);
  });

  it('isProviderConfigured returns false for unknown providers', () => {
    expect(isProviderConfigured('facebook')).toBe(false);
  });

  it('listEnabledProviders includes only configured ones', () => {
    delete process.env.ZOHO_OAUTH_CLIENT_ID;
    delete process.env.ZOHO_OAUTH_CLIENT_SECRET;
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    const list = listEnabledProviders().map((p) => p.name);
    expect(list).toContain('google');
    expect(list).not.toContain('zoho');
  });

  it('getProvider throws on unknown name', () => {
    expect(() => getProvider('twitter')).toThrow(/Unknown OAuth provider/);
  });
});

/* ─── buildAuthorizeUrl ───────────────────────────────────────────────── */
describe('buildAuthorizeUrl', () => {
  const origEnv = { ...process.env };
  afterEach(() => { process.env = { ...origEnv }; });

  it('throws 503 when client id missing', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(() => buildAuthorizeUrl({
      provider: 'google',
      redirectUri: 'https://app.test/auth/callback',
      state: 's',
      codeChallenge: 'c'
    })).toThrow(/not configured/);
  });

  it('embeds PKCE params + state into the URL', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    const url = new URL(buildAuthorizeUrl({
      provider: 'google',
      redirectUri: 'https://app.test/auth/callback',
      state: 'STATE123',
      codeChallenge: 'CHAL123'
    }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('code_challenge')).toBe('CHAL123');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/auth/callback');
    expect(url.searchParams.get('scope')).toContain('openid');
  });

  it('builds a Zoho URL with the Zoho scope', () => {
    process.env.ZOHO_OAUTH_CLIENT_ID = 'zcid';
    process.env.ZOHO_OAUTH_CLIENT_SECRET = 'zcsec';
    const url = new URL(buildAuthorizeUrl({
      provider: 'zoho',
      redirectUri: 'https://app.test/auth/callback',
      state: 's',
      codeChallenge: 'c'
    }));
    expect(url.origin + url.pathname).toBe('https://accounts.zoho.com/oauth/v2/auth');
    expect(url.searchParams.get('scope')).toContain('AaaServer.profile.READ');
  });
});

/* ─── normaliseProfile ────────────────────────────────────────────────── */
describe('normaliseProfile', () => {
  it('normalises Google profiles', () => {
    const p = normaliseProfile('google', {
      sub: '12345', email: 'a@b.com', email_verified: true,
      name: 'Ada Lovelace', given_name: 'Ada', family_name: 'Lovelace'
    });
    expect(p).toEqual(expect.objectContaining({
      provider: 'google', sub: '12345', email: 'a@b.com', name: 'Ada Lovelace'
    }));
  });

  it('rejects Google profile when email is unverified', () => {
    expect(() => normaliseProfile('google', {
      sub: '1', email: 'a@b.com', email_verified: false
    })).toThrow(/not verified/);
  });

  it('normalises Zoho profiles', () => {
    const p = normaliseProfile('zoho', {
      ZUID: '99', Email: 'z@b.com', Display_Name: 'Zara X',
      First_Name: 'Zara', Last_Name: 'X'
    });
    expect(p).toEqual(expect.objectContaining({
      provider: 'zoho', sub: '99', email: 'z@b.com', name: 'Zara X'
    }));
  });

  it('rejects Zoho profile without an email', () => {
    expect(() => normaliseProfile('zoho', { ZUID: '1' })).toThrow(/missing email/);
  });
});

/* ─── exchangeCode (HTTP mocked) ──────────────────────────────────────── */
describe('exchangeCode', () => {
  const origEnv = { ...process.env };
  afterEach(() => { process.env = { ...origEnv }; });

  function mockFetch(seq) {
    let i = 0;
    return jest.fn(async () => {
      const next = seq[i++];
      if (!next) throw new Error('unexpected fetch call');
      return {
        ok: next.ok,
        status: next.status || (next.ok ? 200 : 400),
        json: async () => next.body,
        text: async () => JSON.stringify(next.body)
      };
    });
  }

  it('returns 503 when provider is not configured', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    await expect(exchangeCode({
      provider: 'google', code: 'c', codeVerifier: 'v',
      redirectUri: 'https://app.test/cb', fetchImpl: mockFetch([])
    })).rejects.toMatchObject({ status: 503 });
  });

  it('throws on token endpoint failure', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    const fetchImpl = mockFetch([{ ok: false, status: 400, body: { error: 'invalid_grant' } }]);
    await expect(exchangeCode({
      provider: 'google', code: 'c', codeVerifier: 'v'.repeat(50),
      redirectUri: 'https://app.test/cb', fetchImpl
    })).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/Token exchange failed/) });
  });

  it('throws when access_token is missing from token response', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    const fetchImpl = mockFetch([{ ok: true, body: { id_token: 'x' } }]);
    await expect(exchangeCode({
      provider: 'google', code: 'c', codeVerifier: 'v'.repeat(50),
      redirectUri: 'https://app.test/cb', fetchImpl
    })).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/no access_token/) });
  });

  it('returns a normalised Google profile on success', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    const fetchImpl = mockFetch([
      { ok: true, body: { access_token: 'AT', id_token: 'IT', token_type: 'Bearer' } },
      { ok: true, body: { sub: '42', email: 'ada@x.com', email_verified: true, name: 'Ada' } }
    ]);
    const profile = await exchangeCode({
      provider: 'google', code: 'c', codeVerifier: 'v'.repeat(50),
      redirectUri: 'https://app.test/cb', fetchImpl
    });
    expect(profile).toEqual(expect.objectContaining({
      provider: 'google', sub: '42', email: 'ada@x.com', name: 'Ada'
    }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns a normalised Zoho profile on success', async () => {
    process.env.ZOHO_OAUTH_CLIENT_ID = 'zid';
    process.env.ZOHO_OAUTH_CLIENT_SECRET = 'zsec';
    const fetchImpl = mockFetch([
      { ok: true, body: { access_token: 'AT' } },
      { ok: true, body: { ZUID: '77', Email: 'z@x.com', Display_Name: 'Zara' } }
    ]);
    const profile = await exchangeCode({
      provider: 'zoho', code: 'c', codeVerifier: 'v'.repeat(50),
      redirectUri: 'https://app.test/cb', fetchImpl
    });
    expect(profile).toEqual(expect.objectContaining({
      provider: 'zoho', sub: '77', email: 'z@x.com', name: 'Zara'
    }));
  });

  it('rejects missing required arguments', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec';
    await expect(exchangeCode({ provider: 'google', codeVerifier: 'v', redirectUri: 'x' }))
      .rejects.toMatchObject({ status: 400 });
  });
});
