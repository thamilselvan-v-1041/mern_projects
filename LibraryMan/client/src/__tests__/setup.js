import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { webcrypto } from 'node:crypto';

// Force mock auth mode for all UI tests
import.meta.env.VITE_USE_MOCK_AUTH = 'true';

// jsdom doesn't ship WebCrypto on Node 16 — polyfill from Node's `crypto`
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = webcrypto;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
