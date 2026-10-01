// Data access. The rest of the app only talks to the backend through these
// functions, so mock mode (?mock=1) and the Neon client are interchangeable.

import { AUTH_URL, DATA_API_URL } from './config.js';

export const isMock = new URLSearchParams(location.search).get('mock') === '1';

// Thrown when the backend rejects the user (no session, or not on the allow-list).
export class AuthError extends Error {}

let client = null;
let mock = null;

async function backend() {
  if (isMock) {
    mock ??= await import('./mock.js');
    return mock;
  }
  if (!client) {
    if (DATA_API_URL === 'REPLACE_ME' || AUTH_URL === 'REPLACE_ME') {
      throw new Error('config.js still has placeholder values. Open the app with ?mock=1, or fill in the Neon URLs.');
    }
    const { createClient } = await import('./vendor/neon-js-0.7.0-beta.js');
    client = createClient({ auth: { url: AUTH_URL }, dataApi: { url: DATA_API_URL } });
  }
  return client;
}

// Unwraps a PostgREST response, turning 401/403 into AuthError.
function unwrap({ data, error, status }) {
  if (error) {
    const authFailure = status === 401 || status === 403 || error.code === '42501' || /jwt/i.test(error.message || '');
    const err = authFailure ? new AuthError(error.message) : new Error(error.message || 'Request failed');
    err.details = error;
    throw err;
  }
  return data;
}

// Base URL of the app (keeps the GitHub Pages subpath, drops query and hash).
function appUrl() {
  return location.origin + location.pathname;
}

function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

const byDesc = (key) => (a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0);

// ---- auth -----------------------------------------------------------------

export async function getUser() {
  const b = await backend();
  if (isMock) return b.mockUser;
  const { data, error } = await b.auth.getSession();
  if (error) throw new Error(error.message || 'Could not check the session');
  return data?.session ? data.user : null;
}

export async function signInWithGoogle() {
  if (isMock) return;
  const b = await backend();
  // Full-page redirect: the SDK only uses a popup when running inside an iframe.
  const { error } = await b.auth.signIn.social({
    provider: 'google',
    callbackURL: appUrl(),
    errorCallbackURL: appUrl(),
  });
  if (error) throw new Error(error.message || 'Sign-in failed');
}

export async function signOut() {
  if (isMock) return;
  const b = await backend();
  const { error } = await b.auth.signOut();
  if (error) console.error('Sign-out error', error);
}

// True when the signed-in account can read data. Accounts that are not on the
// allow-list see no rows (RLS) rather than an error, so an empty monthly
// summary is treated as "not authorised".
export async function hasAccess() {
  try {
    const rows = await getMonthlySummary();
    return rows.length > 0;
  } catch (err) {
    if (err instanceof AuthError) return false;
    throw err;
  }
}

// ---- reads ----------------------------------------------------------------

export async function getCategories() {
  const b = await backend();
  if (isMock) return (await b.select('categories')).sort((x, y) => x.sort_order - y.sort_order);
  return unwrap(await b.from('categories').select('id, name, parent_id, kind, color, sort_order').order('sort_order'));
}

// All months, newest first.
export async function getMonthlySummary() {
  const b = await backend();
  if (isMock) return (await b.select('v_monthly_summary')).sort(byDesc('month'));
  return unwrap(await b.from('v_monthly_summary').select('*').order('month', { ascending: false }));
}

export async function getCategoryBreakdown(month, kind = 'expense') {
  const b = await backend();
  if (isMock) {
    return (await b.select('v_monthly_by_category'))
      .filter((r) => r.month === month && r.kind === kind)
      .sort((x, y) => Number(y.total) - Number(x.total));
  }
  return unwrap(
    await b.from('v_monthly_by_category').select('*').eq('month', month).eq('kind', kind).order('total', { ascending: false }),
  );
}

export async function getDailySpend(month) {
  const b = await backend();
  const end = nextMonth(month);
  if (isMock) {
    return (await b.select('v_daily_spend'))
      .filter((r) => r.txn_date >= month && r.txn_date < end)
      .sort((x, y) => (x.txn_date < y.txn_date ? -1 : 1));
  }
  return unwrap(
    await b.from('v_daily_spend').select('*').gte('txn_date', month).lt('txn_date', end).order('txn_date'),
  );
}

// Transactions in a month, newest first.
export async function getTransactions(month) {
  const b = await backend();
  if (isMock) {
    return (await b.select('v_transactions'))
      .filter((r) => r.month === month)
      .sort((x, y) => (x.txn_date === y.txn_date ? byDesc('txn_at')(x, y) : byDesc('txn_date')(x, y)));
  }
  return unwrap(
    await b
      .from('v_transactions')
      .select('*')
      .eq('month', month)
      .order('txn_date', { ascending: false })
      .order('txn_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false }),
  );
}

// Uncategorised transactions grouped by description, biggest groups first.
export async function getReviewQueue() {
  const b = await backend();
  if (isMock) {
    return (await b.select('v_review_queue')).sort((x, y) => y.txn_count - x.txn_count || Number(y.total_amount) - Number(x.total_amount));
  }
  return unwrap(
    await b.from('v_review_queue').select('*').order('txn_count', { ascending: false }).order('total_amount', { ascending: false }),
  );
}

// ---- writes (only through the two database functions) ---------------------

// Creates a rule and applies it. Returns the number of transactions updated.
export async function categorize({ pattern, categoryId, merchantName = null, matchType = 'exact' }) {
  const b = await backend();
  const args = {
    p_pattern: pattern,
    p_category_id: categoryId,
    p_merchant_name: merchantName || null,
    p_match_type: matchType,
  };
  const result = isMock ? await b.rpc('fin_categorize', args) : unwrap(await b.rpc('fin_categorize', args));
  return Number(result) || 0;
}

export async function setCategory({ txnId, categoryId, note = null }) {
  const b = await backend();
  const args = { p_txn_id: txnId, p_category_id: categoryId, p_note: note || null };
  if (isMock) await b.rpc('fin_set_category', args);
  else unwrap(await b.rpc('fin_set_category', args));
}
