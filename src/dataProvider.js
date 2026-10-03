// React Admin data provider over the Neon Data API (PostgREST) or the mock fixture.
// Reads come from the views; writes only go through fin_categorize and fin_set_category.

import { HttpError } from 'react-admin';
import { AuthError, getClient, getMock, isMock, nextMonth, num, unwrap } from './backend.js';

// resource -> { view, id }
const RESOURCES = {
  transactions: { view: 'v_transactions', id: (r) => r.id },
  review: { view: 'v_review_queue', id: (r) => r.description_norm },
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
      } else if (key === 'description_prefix') {
        if (!String(r.description_norm || '').startsWith(value)) return false;
      } else if (key === 'id' || Array.isArray(value)) {
        if (![].concat(value).map(String).includes(String(r[key]))) return false;
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
    } else if (key === 'description_prefix') {
      // What a 'prefix' rule would match; LIKE wildcards in the text are escaped.
      q = q.like('description_norm', `${String(value).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    } else if (key === 'id' || Array.isArray(value)) {
      q = q.in(key, [].concat(value));
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

// A parent category's filter also matches its subcategories. The category list is
// cached briefly and dropped after any category edit.
let categoryCache = null;
async function cachedCategories() {
  if (!categoryCache || Date.now() - categoryCache.at > 60_000) {
    categoryCache = { at: Date.now(), data: list('categories', { filter: {} }).then((r) => r.data) };
    categoryCache.data.catch(() => { categoryCache = null; });
  }
  return categoryCache.data;
}

async function expandCategoryFilter(filter) {
  const id = filter?.category_id;
  if (id == null || id === '' || id === 'none' || Array.isArray(id)) return filter;
  const categories = await cachedCategories();
  const children = categories.filter((c) => String(c.parent_id) === String(id)).map((c) => c.id);
  return children.length ? { ...filter, category_id: [Number(id), ...children] } : filter;
}

async function list(resource, { pagination, sort, filter } = {}) {
  const { view } = RESOURCES[resource];
  if (resource === 'transactions') filter = await expandCategoryFilter(filter);
  const page = pagination?.page ?? 1;
  const perPage = pagination?.perPage ?? 1000;
  if (isMock) {
    const mock = await getMock();
    let rows = mockFilter(withIds(resource, await mock.select(view)), filter);
    // Same tie-break as the real query: date, then time, then entry order.
    if (resource === 'transactions' && sort?.field === 'txn_date') rows = mockSort(mockSort(mockSort(rows, { field: 'id', order: sort.order }), { field: 'txn_at', order: sort.order }), sort);
    else rows = mockSort(rows, sort);
    return { data: rows.slice((page - 1) * perPage, page * perPage), total: rows.length };
  }
  const client = await getClient();
  let query = applyFilters(client.from(view).select('*', { count: 'exact' }), filter);
  if (sort?.field && sort.field !== 'id') query = query.order(sort.field, { ascending: sort.order !== 'DESC', nullsFirst: false });
  // Same-day transactions: by time where the source has one, then by entry order.
  if (resource === 'transactions' && sort?.field === 'txn_date') {
    query = query.order('txn_at', { ascending: sort.order !== 'DESC', nullsFirst: false }).order('id', { ascending: sort.order !== 'DESC' });
  }
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

async function categoryWrite(name, args) {
  try {
    return await rpc(name, args);
  } finally {
    categoryCache = null;
  }
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

  // Month-end balance across all accounts, oldest first:
  // [{ month: 'YYYY-MM-01', day, balance, cash, savings, investment, saved }]: the
  // day-to-day accounts, savings accounts, investments at cost, and savings + investments.
  // The last day of the latest month is the most recent known day, not the month end.
  getBalanceHistory: () =>
    guard(async () => {
      let rows;
      if (isMock) rows = await (await getMock()).select('v_balance_daily');
      else {
        const client = await getClient();
        // Newest first, so a server row cap would drop the oldest days, not the latest.
        rows = unwrap(await client.from('v_balance_daily').select('day,balance,kind').order('day', { ascending: false }).range(0, 19999)).data;
      }
      const byDay = new Map();
      for (const r of rows) {
        const d = byDay.get(r.day) || { cash: 0, savings: 0, investment: 0 };
        const kind = ['savings', 'investment'].includes(r.kind) ? r.kind : 'cash';
        d[kind] += num(r.balance);
        byDay.set(r.day, d);
      }
      const byMonth = new Map();
      for (const day of [...byDay.keys()].sort()) {
        const { cash, savings, investment } = byDay.get(day);
        byMonth.set(`${day.slice(0, 7)}-01`, { month: `${day.slice(0, 7)}-01`, day, balance: cash + savings + investment, cash, savings, investment, saved: savings + investment });
      }
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

  // Number of transactions per category id, over all months.
  getCategoryUsage: () =>
    guard(async () => {
      let rows;
      if (isMock) rows = await (await getMock()).select('v_monthly_by_category');
      else {
        const client = await getClient();
        rows = unwrap(await client.from('v_monthly_by_category').select('category_id,txn_count').range(0, 9999)).data;
      }
      const usage = new Map();
      for (const r of rows) if (r.category_id != null) usage.set(r.category_id, (usage.get(r.category_id) || 0) + num(r.txn_count));
      return usage;
    }),

  // Category editing (fin_save_category, fin_delete_category, fin_move_category).
  saveCategory: ({ id = null, name, kind, parentId = null, color = null }) =>
    guard(async () => num(await categoryWrite('fin_save_category', { p_id: id, p_name: name, p_kind: kind, p_parent_id: parentId, p_color: color || null }))),

  // Returns how many transactions were moved (or left uncategorised).
  deleteCategory: ({ id, replaceId = null }) =>
    guard(async () => num(await categoryWrite('fin_delete_category', { p_id: id, p_replace_id: replaceId }))),

  moveCategory: ({ id, direction }) => guard(() => categoryWrite('fin_move_category', { p_id: id, p_direction: direction })),

  setCategory: ({ txnId, categoryId, note = null }) =>
    guard(() => rpc('fin_set_category', { p_txn_id: txnId, p_category_id: categoryId, p_note: note || null })),
};
