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

// The Data API client, with the session renewed first when it may have gone
// stale. After the tab has been idle the stored token can be expired; a request
// sent with it is not refused but runs without the user, so every view comes back
// empty (the "No transactions yet" after a pause). getSession() renews the token,
// so it runs before the first request after a pause and when the tab comes back.
// Concurrent requests share one renewal.
const SESSION_CHECK_MS = 60_000;
let sessionCheck = null;
let sessionCheckedAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sessionCheckedAt = 0;
  });
}

export async function getFreshClient() {
  const client = await getClient();
  if (!sessionCheck || Date.now() - sessionCheckedAt > SESSION_CHECK_MS) {
    sessionCheckedAt = Date.now();
    sessionCheck = client.auth.getSession().catch((err) => console.error('Session refresh failed', err));
  }
  await sessionCheck;
  return client;
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

// Works out why a request was refused, from the session and the database's own
// allow-list check rather than from status codes:
//   'signed-out' - no session (expired or cleared): sign in again
//   'denied'     - signed in, but fin_is_allowed() says no
//   'allowed'    - signed in and allowed: the failure was transient
//   'unknown'    - could not tell (offline, network error)
export async function checkAccess() {
  if (isMock) return 'allowed';
  try {
    const client = await getClient();
    const { data } = await client.auth.getSession();
    if (!data?.session) return 'signed-out';
    const { data: allowed, error } = await client.rpc('fin_is_allowed');
    if (error) {
      console.error('Access check failed', error);
      return 'unknown';
    }
    return allowed === true ? 'allowed' : 'denied';
  } catch (err) {
    console.error('Access check failed', err);
    return 'unknown';
  }
}

// Base URL of the app: keeps the GitHub Pages subpath, drops query and hash.
export const appUrl = () => window.location.origin + window.location.pathname;

export const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
