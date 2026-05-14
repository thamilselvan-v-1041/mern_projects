/**
 * Thin wrapper around the Catalyst Embedded Authentication Web SDK.
 *
 * The SDK is loaded at runtime from Catalyst's CDN — there is no npm package.
 * In local dev (VITE_USE_MOCK_AUTH=true) we substitute a localStorage-backed
 * mock so the UI is fully testable without a real Catalyst project.
 *
 * Public API:
 *   loadCatalystSDK()           → Promise<void>     resolved when window.catalyst is ready
 *   getCurrentUser()            → Promise<user|null>
 *   signOut()                   → Promise<void>
 *   renderSignIn(elementId)     → renders Catalyst's hosted login UI
 *   getRole(user)               → 'admin' | 'member'
 *   mockSignIn(role)            → dev-only helper to switch test identity
 */

const USE_MOCK = import.meta.env.VITE_USE_MOCK_AUTH === 'true';
const CATALYST_SDK_URL =
  import.meta.env.VITE_CATALYST_SDK_URL ||
  'https://static.zohocdn.com/catalyst/sdk/js/4.4.1/catalystWebSDK.js';

let sdkLoadPromise = null;

export function loadCatalystSDK() {
  if (USE_MOCK) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.catalyst) return resolve();
    const s = document.createElement('script');
    s.src = CATALYST_SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Catalyst SDK'));
    document.head.appendChild(s);
  });
  return sdkLoadPromise;
}

export function getRole(user) {
  return user?.role_details?.role_name || user?.role_name || 'member';
}

/* ─── MOCK MODE (local dev / tests) ───────────────────────────────────── */
const MOCK_KEY = 'libraryman.mockUser';

function readMockUser() {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function mockSignIn(role = 'member') {
  const user = role === 'admin'
    ? { user_id: 'mock-admin',  email_id: 'admin@local',  first_name: 'Admin',  last_name: 'User', role_details: { role_name: 'admin'  } }
    : { user_id: 'mock-member', email_id: 'member@local', first_name: 'Member', last_name: 'User', role_details: { role_name: 'member' } };
  localStorage.setItem(MOCK_KEY, JSON.stringify(user));
  return user;
}

/* ─── Public API ──────────────────────────────────────────────────────── */
export async function getCurrentUser() {
  if (USE_MOCK) return readMockUser();
  await loadCatalystSDK();
  try {
    const user = await window.catalyst.auth.currentUser();
    return user || null;
  } catch {
    return null;
  }
}

export async function signOut() {
  if (USE_MOCK) {
    localStorage.removeItem(MOCK_KEY);
    return;
  }
  await loadCatalystSDK();
  // Catalyst SDK redirects to a configured logout URL
  return window.catalyst.auth.signOut(window.location.origin);
}

export async function renderSignIn(elementId = 'catalyst-signin') {
  if (USE_MOCK) return; // mock mode uses dev buttons instead
  await loadCatalystSDK();
  const config = {
    signin_providers_only: false,
    forgot_password: true,
    signup_in: 'both', // 'signin' | 'signup' | 'both'
    css_url: ''
  };
  window.catalyst.auth.signIn(elementId, config);
}

export const isMockMode = () => USE_MOCK;
