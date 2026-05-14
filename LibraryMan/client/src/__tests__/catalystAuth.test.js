import { describe, it, expect, beforeEach } from 'vitest';
import { getCurrentUser, mockSignIn, signOut, getRole, isMockMode } from '../auth/catalystAuth';

describe('catalystAuth (mock mode)', () => {
  beforeEach(() => localStorage.clear());

  it('isMockMode reflects env flag', () => {
    expect(isMockMode()).toBe(true);
  });

  it('getCurrentUser returns null when no mock signed in', async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it('mockSignIn → getCurrentUser round-trip (member)', async () => {
    mockSignIn('member');
    const u = await getCurrentUser();
    expect(u.user_id).toBe('mock-member');
    expect(getRole(u)).toBe('member');
  });

  it('mockSignIn → getCurrentUser round-trip (admin)', async () => {
    mockSignIn('admin');
    const u = await getCurrentUser();
    expect(getRole(u)).toBe('admin');
  });

  it('signOut clears the user', async () => {
    mockSignIn('admin');
    await signOut();
    expect(await getCurrentUser()).toBeNull();
  });

  it('getRole defaults to "member" on unknown shape', () => {
    expect(getRole({})).toBe('member');
    expect(getRole(null)).toBe('member');
  });
});
