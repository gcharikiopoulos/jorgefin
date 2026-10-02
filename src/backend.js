// Single access point to the backend: the Neon client (Data API + Auth) or the
// invented fixture in mock.js when the page is opened with ?mock=1.

import { AUTH_URL, DATA_API_URL } from './config.js';

export const isMock = new URLSearchParams(window.location.search).get('mock') === '1';

// Thrown when the backend rejects the user (no session, or not on the allow-list).
export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let clientPromise = null;
let mockPromise = null;

export function getMock() {
  mockPromise ??= import('./mock.js');
  return mockPromise;
}

export function getClient() {
  clientPromise ??= import('@neondatabase/neon-js').then(({ createClient }) =>
    createClient({ auth: { url: AUTH_URL }, dataApi: { url: DATA_API_URL } }),
  );
  return clientPromise;
}

// Unwraps a PostgREST response, turning 401/403 and permission errors into AuthError.
export function unwrap({ data, error, status, count }) {
  if (error) {
    const authFailure = status === 401 || status === 403 || error.code === '42501' || /jwt/i.test(error.message || '');
    console.error('Data API error', status, error);
    if (authFailure) throw new AuthError(error.message || 'Not authorised', status === 401 ? 401 : 403);
    throw new Error(error.message || 'Request failed');
  }
  return { data, count };
}

// Base URL of the app: keeps the GitHub Pages subpath, drops query and hash.
export const appUrl = () => window.location.origin + window.location.pathname;

export const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
