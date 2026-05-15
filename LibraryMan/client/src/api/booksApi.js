import axios from 'axios';
import { getCurrentUser, isMockMode } from '../auth/catalystAuth';

/**
 * Base URL strategy:
 *  - Local dev   : Vite proxies /api → http://localhost:3001 (vite.config.js)
 *  - Production  : drop `VITE_API_BASE=…` into client/.env.local for the
 *                  build step (gitignored — keeps the URL out of version
 *                  control). All flows (popular, search, list, CRUD) go
 *                  through this base URL — no browser-direct fallback.
 */
const baseURL = import.meta.env.VITE_API_BASE || '/api';

const api = axios.create({
  baseURL,
  timeout: 10000,
  withCredentials: true // include Catalyst session cookies on cross-origin calls
});

// In mock mode we have no real session — attach the resolved user as a header
// so the backend's `requireAuth` middleware can authorise the request.
api.interceptors.request.use(async (config) => {
  if (isMockMode()) {
    const u = await getCurrentUser();
    if (u) config.headers['x-mock-user'] = JSON.stringify(u);
  }
  return config;
});

// Surface a friendlier message for auth/role failures
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response) {
      const code = err.response.status;
      if (code === 401) err.message = 'You need to sign in to do that.';
      else if (code === 403) err.message = err.response.data?.error || 'You don\'t have permission for that action.';
    }
    return Promise.reject(err);
  }
);

export const booksApi = {
  list:    ()         => api.get('/books').then(r => r.data),
  popular: (startIndex = 0, size = 30, { language = '', category = '' } = {}) =>
    api.get('/books/popular', { params: { startIndex, size, language, category } }).then(r => r.data),
  search:  (q, startIndex = 0, size = 30) =>
    api.get('/books/search',  { params: { q, startIndex, size } }).then(r => r.data),
  add:     (payload)  => api.post('/books', payload).then(r => r.data),
  lend:    (id)       => api.post(`/books/${id}/lend`).then(r => r.data),
  return:  (id)       => api.post(`/books/${id}/return`).then(r => r.data),
  remove:  (id)       => api.delete(`/books/${id}`).then(r => r.data),
  myLoans: ()         => api.get('/books/me/loans').then(r => r.data)
};
