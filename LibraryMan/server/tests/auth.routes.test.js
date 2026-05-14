const request = require('supertest');

// Configure providers BEFORE requiring the app so route discovery sees them
process.env.GOOGLE_OAUTH_CLIENT_ID = 'g-cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'g-csec';
process.env.ZOHO_OAUTH_CLIENT_ID = 'z-cid';
process.env.ZOHO_OAUTH_CLIENT_SECRET = 'z-csec';
process.env.ADMIN_EMAILS = 'boss@acme.com';

const app = require('../index');
const oauth = require('../services/oauthProviders');

describe('GET /auth/providers', () => {
  it('returns enabled providers + mock flag', async () => {
    const res = await request(app).get('/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const names = res.body.data.providers.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['zoho', 'google']));
    expect(res.body.data.mock).toBe(true);
  });
});

describe('POST /auth/oauth/authorize', () => {
  it('returns 400 on invalid provider', async () => {
    const res = await request(app)
      .post('/auth/oauth/authorize')
      .send({ provider: 'facebook', redirectUri: 'https://app.test/cb' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing redirectUri', async () => {
    const res = await request(app)
      .post('/auth/oauth/authorize')
      .send({ provider: 'google' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-http redirectUri', async () => {
    const res = await request(app)
      .post('/auth/oauth/authorize')
      .send({ provider: 'google', redirectUri: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('returns authorize URL + state + verifier for a configured provider', async () => {
    const res = await request(app)
      .post('/auth/oauth/authorize')
      .send({ provider: 'google', redirectUri: 'https://app.test/auth/callback' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(res.body.data.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(res.body.data.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe('POST /auth/oauth/exchange', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects when state ≠ expectedState (CSRF guard)', async () => {
    const res = await request(app)
      .post('/auth/oauth/exchange')
      .send({
        provider: 'google',
        code: 'abc',
        state: 'aaaa',
        expectedState: 'bbbb',
        codeVerifier: 'v'.repeat(50),
        redirectUri: 'https://app.test/auth/callback'
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/State mismatch/);
  });

  it('rejects malformed bodies', async () => {
    const res = await request(app)
      .post('/auth/oauth/exchange')
      .send({ provider: 'google' });
    expect(res.status).toBe(400);
  });

  it('returns the normalised member user on a successful Google round-trip', async () => {
    jest.spyOn(oauth, 'exchangeCode').mockResolvedValue({
      provider: 'google', sub: '1', email: 'alice@acme.com', name: 'Alice A', raw: {}
    });
    const res = await request(app)
      .post('/auth/oauth/exchange')
      .send({
        provider: 'google',
        code: 'abc',
        state: 'same',
        expectedState: 'same',
        codeVerifier: 'v'.repeat(50),
        redirectUri: 'https://app.test/auth/callback'
      });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toEqual(expect.objectContaining({
      user_id: 'google-1',
      email_id: 'alice@acme.com',
      provider: 'google',
      role_details: { role_name: 'member' }
    }));
  });

  it('maps ADMIN_EMAILS to admin role', async () => {
    jest.spyOn(oauth, 'exchangeCode').mockResolvedValue({
      provider: 'zoho', sub: '9', email: 'boss@acme.com', name: 'Boss', raw: {}
    });
    const res = await request(app)
      .post('/auth/oauth/exchange')
      .send({
        provider: 'zoho',
        code: 'abc',
        state: 'same',
        expectedState: 'same',
        codeVerifier: 'v'.repeat(50),
        redirectUri: 'https://app.test/auth/callback'
      });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role_details.role_name).toBe('admin');
  });

  it('surfaces provider error status to the client', async () => {
    jest.spyOn(oauth, 'exchangeCode').mockRejectedValue(
      Object.assign(new Error('Token exchange failed (401): invalid_grant'), { status: 401 })
    );
    const res = await request(app)
      .post('/auth/oauth/exchange')
      .send({
        provider: 'google',
        code: 'abc',
        state: 'same',
        expectedState: 'same',
        codeVerifier: 'v'.repeat(50),
        redirectUri: 'https://app.test/auth/callback'
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Token exchange failed/);
  });
});
