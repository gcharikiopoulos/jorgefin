// React Admin data provider over the Neon Data API (PostgREST) or the mock fixture.
// Reads come from the views; writes only go through fin_categorize and fin_set_category.

import { HttpError } from 'react-admin';
import { AuthError, getClient, getMock, isMock, nextMonth, num, unwrap } from './backend.js';

// resource -> { view, id }
const RESOURCES = {
  transactions: { view: 'v_transactions', id: (r) => r.id },
  review: { view: 'v_review_queue', id: (r) => `${r.description_norm}|${r.direction}` },
  categories: { view: 'categories', id: (r) => r.id },
  merchants: { view: 'v_merchant_summary', id: (r) => r.merchant_id ?? `none|${r.merchant_name}` },
};

const withIds = (resource, rows) => rows.map((r) => ({ ...r, id: RESOURCES[resource].id(r) }));

// PostgREST's or() syntax uses , ( ) and * as operators; strip them from free text.
const cleanSearch = (q) => String(q).replace(/[,()*%\\]/g, ' ').trim();

// ---- mock-mode filtering, sorting and paging -------------------------------

function mockFilter(rows, filter) {
  return rows.filter((r) => {
    for (const [key, value] of Object.entries(filter || {})) {
      if (value === '' || value == null) continue;
      if (key === 'q') {
        const q = cleanSearch(value).toLocaleLowerCase();
        if (q && ![r.merchant_name, r.description, r.sample_description, r.name].some((v) => v && v.toLocaleLowerCase().includes(q))) return false;
      } else if (key === 'category_id' && value === 'none') {
        if (r.category_id != null) return false;
      } else if (key === 'id') {
        if (![].concat(value).map(String).includes(String(r.id))) return false;
      } else if (String(r[key]) !== String(value)) {
        return false;
      }
    }
    return true;
  });
}

function mockSort(rows, { field, order } = {}) {
  if (!field) return rows;
  const dir = order === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[field];
    const y = b[field];
    const nx = Number(x);
    const ny = Number(y);
    const cmp = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '' ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''));
    return cmp * dir;
  });
}

// ---- real-mode query building ------------------------------------------------

function applyFilters(query, filter) {
  let q = query;
  for (const [key, value] of Object.entries(filter || {})) {
    if (value === '' || value == null) continue;
    if (key === 'q') {
      const text = cleanSearch(value);
      if (text) q = q.or(`merchant_name.ilike.*${text}*,description.ilike.*${text}*`);
    } else if (key === 'category_id' && value === 'none') {
      q = q.is('category_id', null);
    } else if (key === 'id') {
      q = q.in('id', [].concat(value));
    } else {
      q = q.eq(key, value);
    }
  }
  return q;
}

// Wraps a call so auth failures reach React Admin's authProvider.checkError.
async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthError) throw new HttpError(err.message, err.status);
    throw err;
  }
}

async function list(resource, { pagination, sort, filter } = {}) {
  const { view } = RESOURCES[resource];
  const page = pagination?.page ?? 1;
  const perPage = pagination?.perPage ?? 1000;
  if (isMock) {
    const mock = await getMock();
    const rows = mockSort(mockFilter(withIds(resource, await mock.select(view)), filter), sort);
    return { data: rows.slice((page - 1) * perPage, page * perPage), total: rows.length };
  }
  const client = await getClient();
  let query = applyFilters(client.from(view).select('*', { count: 'exact' }), filter);
  if (sort?.field && sort.field !== 'id') query = query.order(sort.field, { ascending: sort.order !== 'DESC', nullsFirst: false });
  else if (sort?.field === 'id' && resource !== 'review') query = query.order('id', { ascending: sort.order !== 'DESC' });
  query = query.range((page - 1) * perPage, page * perPage - 1);
  const { data, count } = unwrap(await query);
  return { data: withIds(resource, data), total: count ?? data.length };
}

async function rpc(name, args) {
  if (isMock) return (await getMock()).rpc(name, args);
  const client = await getClient();
  return unwrap(await client.rpc(name, args)).data;
}

const readOnly = () => Promise.reject(new Error('This resource is read-only'));

export const dataProvider = {
  getList: (resource, params) => guard(() => list(resource, params)),

  getOne: (resource, { id }) =>
    guard(async () => {
      const { data } = await list(resource, { filter: resource === 'review' ? {} : { id } });
      const row = data.find((r) => String(r.id) === String(id));
      if (!row) throw new HttpError('Not found', 404);
      return { data: row };
    }),

  getMany: (resource, { ids }) =>
    guard(async () => {
      const { data } = await list(resource, { filter: { id: ids } });
      return { data };
    }),

  getManyReference: (resource, { target, id, pagination, sort, filter }) =>
    guard(() => list(resource, { pagination, sort, filter: { ...filter, [target]: id } })),

  create: readOnly,
  update: readOnly,
  updateMany: readOnly,
  delete: readOnly,
  deleteMany: readOnly,

  // ---- dashboard queries ----

  // All months, newest first.
  getMonthlySummary: () =>
    guard(async () => {
      if (isMock) return mockSort(await (await getMock()).select('v_monthly_summary'), { field: 'month', order: 'DESC' });
      const client = await getClient();
      return unwrap(await client.from('v_monthly_summary').select('*').order('month', { ascending: false })).data;
    }),

  getCategoryBreakdown: (month, kind = 'expense') =>
    guard(async () => {
      if (isMock) {
        const rows = await (await getMock()).select('v_monthly_by_category');
        return mockSort(rows.filter((r) => r.month === month && r.kind === kind), { field: 'total', order: 'DESC' });
      }
      const client = await getClient();
      return unwrap(await client.from('v_monthly_by_category').select('*').eq('month', month).eq('kind', kind).order('total', { ascending: false })).data;
    }),

  getDailySpend: (month) =>
    guard(async () => {
      const end = nextMonth(month);
      if (isMock) {
        const rows = await (await getMock()).select('v_daily_spend');
        return mockSort(rows.filter((r) => r.txn_date >= month && r.txn_date < end), { field: 'txn_date', order: 'ASC' });
      }
      const client = await getClient();
      return unwrap(await client.from('v_daily_spend').select('*').gte('txn_date', month).lt('txn_date', end).order('txn_date')).data;
    }),

  // Month-end balance across all accounts, oldest first: [{ month: 'YYYY-MM-01', day, balance }].
  // The last day of the latest month is the most recent known day, not the month end.
  getBalanceHistory: () =>
    guard(async () => {
      let rows;
      if (isMock) rows = await (await getMock()).select('v_balance_daily');
      else {
        const client = await getClient();
        // Newest first, so a server row cap would drop the oldest days, not the latest.
        rows = unwrap(await client.from('v_balance_daily').select('day,balance').order('day', { ascending: false }).range(0, 9999)).data;
      }
      const byDay = new Map();
      for (const r of rows) byDay.set(r.day, (byDay.get(r.day) || 0) + num(r.balance));
      const byMonth = new Map();
      for (const day of [...byDay.keys()].sort()) byMonth.set(`${day.slice(0, 7)}-01`, { month: `${day.slice(0, 7)}-01`, day, balance: byDay.get(day) });
      return [...byMonth.values()];
    }),

  // ---- writes ----

  // Creates a rule and applies it. Returns the number of transactions updated.
  categorize: ({ pattern, categoryId, merchantName = null, matchType = 'exact' }) =>
    guard(async () =>
      num(await rpc('fin_categorize', {
        p_pattern: pattern,
        p_category_id: categoryId,
        p_merchant_name: merchantName || null,
        p_match_type: matchType,
      })),
    ),

  setCategory: ({ txnId, categoryId, note = null }) =>
    guard(() => rpc('fin_set_category', { p_txn_id: txnId, p_category_id: categoryId, p_note: note || null })),
};
