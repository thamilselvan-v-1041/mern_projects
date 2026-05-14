import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateState,
  generateCodeVerifier,
  codeChallengeFor,
  beginOAuth,
  completeOAuth,
  mockSignInWithProvider
} from '../auth/oauthClient';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('PKCE generation', () => {
  it('generateState produces URL-safe base64', () => {
    const s = generateState();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(generateState()).not.toBe(generateState());
  });

  it('generateCodeVerifier satisfies RFC 7636 length', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('codeChallengeFor matches Node SHA-256 base64url', async () => {
    const verifier = 'fixed-verifier-1234567890ABCDEFGHIJKLMNOP';
    const expected = createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await codeChallengeFor(verifier)).toBe(expected);
  });
});

describe('beginOAuth (mock mode)', () => {
  it('synthesises a user without a redirect when in mock mode', async () => {
    const res = await beginOAuth('zoho', 'http://localhost/auth/callback');
    expect(res.mock).toBe(true);
    expect(res.user.provider).toBe('zoho');
    expect(res.user.role_details.role_name).toBe('admin'); // zoho → admin in mock map
    expect(JSON.parse(localStorage.getItem('libraryman.mockUser')).provider).toBe('zoho');
  });

  it('mocks google as member', async () => {
    const res = await beginOAuth('google', 'http://localhost/auth/callback');
    expect(res.user.provider).toBe('google');
    expect(res.user.role_details.role_name).toBe('member');
  });
});

describe('completeOAuth state validation', () => {
  it('throws when ?code or ?state is missing', async () => {
    await expect(completeOAuth('?code=abc')).rejects.toThrow(/Missing code or state/);
    await expect(completeOAuth('?state=abc')).rejects.toThrow(/Missing code or state/);
  });

  it('throws on provider-reported error', async () => {
    await expect(completeOAuth('?error=access_denied')).rejects.toThrow(/access_denied/);
  });

  it('throws on state mismatch when sessionStorage is empty', async () => {
    await expect(completeOAuth('?code=abc&state=unknown')).rejects.toThrow(/State mismatch/);
  });
});

describe('mockSignInWithProvider', () => {
  it('writes a provider-tagged user to localStorage', () => {
    const u = mockSignInWithProvider('google', 'admin');
    expect(u.provider).toBe('google');
    expect(u.role_details.role_name).toBe('admin');
    const stored = JSON.parse(localStorage.getItem('libraryman.mockUser'));
    expect(stored.user_id).toBe('google-mock-admin');
  });
});
