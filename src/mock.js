// Mock backend for ?mock=1. Every merchant, description and amount here is
// invented. Rows mirror the shapes of the real views; numeric columns are
// strings, as Postgres `numeric` would arrive.

const categories = [
  { id: 1, name: 'Groceries', parent_id: null, kind: 'expense', color: null, sort_order: 10 },
  { id: 2, name: 'Eating out', parent_id: null, kind: 'expense', color: null, sort_order: 20 },
  { id: 3, name: 'Transport', parent_id: null, kind: 'expense', color: null, sort_order: 30 },
  { id: 4, name: 'Utilities', parent_id: null, kind: 'expense', color: null, sort_order: 40 },
  { id: 5, name: 'Rent', parent_id: null, kind: 'expense', color: null, sort_order: 50 },
  { id: 6, name: 'Shopping', parent_id: null, kind: 'expense', color: null, sort_order: 60 },
  { id: 7, name: 'Health', parent_id: null, kind: 'expense', color: null, sort_order: 70 },
  { id: 8, name: 'Leisure', parent_id: null, kind: 'expense', color: null, sort_order: 80 },
  { id: 9, name: 'Salary', parent_id: null, kind: 'income', color: null, sort_order: 90 },
  { id: 10, name: 'Side income', parent_id: null, kind: 'income', color: null, sort_order: 100 },
  { id: 11, name: 'Savings transfer', parent_id: null, kind: 'transfer', color: null, sort_order: 110 },
];

const merchants = [
  { id: 1, name: 'Fresko Market', desc: 'POS FRESKO MARKET 0142', cat: 1, min: 18, max: 95, perMonth: 6 },
  { id: 2, name: 'Blue Kettle Cafe', desc: 'CARD BLUE KETTLE CAFE', cat: 2, min: 3, max: 14, perMonth: 5 },
  { id: 3, name: 'Olive & Ember', desc: 'POS OLIVE AND EMBER 77', cat: 2, min: 25, max: 70, perMonth: 2 },
  { id: 4, name: 'Metroline Pass', desc: 'METROLINE PASS TOPUP', cat: 3, min: 20, max: 30, perMonth: 1 },
  { id: 5, name: 'Lumen Power', desc: 'DD LUMEN POWER SA', cat: 4, min: 48, max: 85, perMonth: 1 },
  { id: 6, name: 'Nimbus Mobile', desc: 'DD NIMBUS MOBILE', cat: 4, min: 22, max: 22, perMonth: 1 },
  { id: 7, name: 'Harbour Lettings', desc: 'SO HARBOUR LETTINGS RENT', cat: 5, min: 650, max: 650, perMonth: 1 },
  { id: 8, name: 'Paperleaf Books', desc: 'CARD PAPERLEAF BOOKS', cat: 6, min: 9, max: 40, perMonth: 1 },
  { id: 9, name: 'Pinecone Pharmacy', desc: 'POS PINECONE PHARMACY', cat: 7, min: 6, max: 35, perMonth: 1 },
  { id: 10, name: 'Orbit Cinema', desc: 'CARD ORBIT CINEMA 3', cat: 8, min: 9, max: 24, perMonth: 1 },
  { id: 11, name: 'Acme Widgets Ltd', desc: 'SALARY ACME WIDGETS LTD', cat: 9, min: 1850, max: 1850, perMonth: 1, credit: true, day: 28 },
  { id: 12, name: 'Own savings', desc: 'TRANSFER TO SAVINGS 9921', cat: 11, min: 200, max: 200, perMonth: 1, day: 29 },
];

// Descriptions that no rule matches yet, so they land in the review queue.
const unknowns = [
  { desc: 'POS ZEPHYR KIOSK 4411', min: 2, max: 9, perMonth: 3 },
  { desc: 'CARD QWIKMART 22 ATHENS', min: 8, max: 30, perMonth: 2 },
  { desc: 'ONLINE PIXELBOX STORE', min: 15, max: 60, perMonth: 1 },
  { desc: 'IBAN TRANSFER FROM J DOE', min: 40, max: 120, perMonth: 1, credit: true },
];

const months = ['2020-11', '2020-12', '2021-01'];

// Deterministic pseudo-random numbers so the fixture is identical on every load.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const normalise = (s) => s.toUpperCase().replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim();

const rules = []; // { pattern, match_type, category_id, merchant_name }
const txns = [];

function addTxn(ym, day, description, amount, credit, merchant) {
  const date = `${ym}-${pad(day)}`;
  txns.push({
    id: txns.length + 1,
    account_id: 1,
    source: 'mock',
    posting_date: date,
    value_date: date,
    txn_at: `${date}T${pad(8 + Math.floor(rand() * 12))}:${pad(Math.floor(rand() * 60))}:00Z`,
    txn_date: date,
    month: `${ym}-01`,
    description,
    description_norm: normalise(description),
    amount: amount.toFixed(2),
    direction: credit ? 'credit' : 'debit',
    merchant_id: merchant ? merchant.id : null,
    merchant_name: merchant ? merchant.name : null,
    category_id: merchant ? merchant.cat : null,
    category_source: merchant ? 'rule' : null,
    cardholder: 'A',
    note: null,
  });
}

// January is cut short so the latest month looks "in progress".
for (const ym of months) {
  const lastDay = ym === '2021-01' ? 20 : daysIn(ym);
  for (const m of merchants) {
    for (let i = 0; i < m.perMonth; i++) {
      const day = m.day ? Math.min(m.day, lastDay) : 1 + Math.floor(rand() * lastDay);
      addTxn(ym, day, m.desc, between(m.min, m.max), m.credit, m);
    }
  }
  for (const u of unknowns) {
    const n = ym === '2021-01' ? u.perMonth : Math.max(1, u.perMonth - 1);
    for (let i = 0; i < n; i++) {
      addTxn(ym, 1 + Math.floor(rand() * lastDay), u.desc, between(u.min, u.max), u.credit, null);
    }
  }
}

// ---- view builders --------------------------------------------------------

const catById = (id) => categories.find((c) => c.id === id) || null;
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

function vTransactions() {
  return txns.map((t) => {
    const c = catById(t.category_id);
    const amount = Number(t.amount);
    const signed = t.direction === 'credit' ? amount : -amount;
    return {
      ...t,
      signed_amount: money(signed),
      txn_type: t.direction === 'credit' ? 'transfer_in' : 'card',
      category: c ? c.name : null,
      parent_category: null,
      kind: c ? c.kind : null,
      color: c ? c.color : null,
      expense_amount: c && c.kind === 'expense' ? money(amount) : t.direction === 'debit' && !c ? money(amount) : '0.00',
      income_amount: c && c.kind === 'income' ? money(amount) : t.direction === 'credit' && !c ? money(amount) : '0.00',
    };
  });
}

// Daily balance worked back from an invented closing balance.
function vBalanceDaily() {
  const net = new Map();
  for (const t of txns) net.set(t.posting_date, (net.get(t.posting_date) || 0) + (t.direction === 'credit' ? 1 : -1) * Number(t.amount));
  const days = [...net.keys()].sort();
  let balance = 3200;
  const rows = [];
  for (let i = days.length - 1; i >= 0; i--) {
    rows.push({ account_id: 1, day: days[i], net_change: money(net.get(days[i])), balance: money(balance) });
    balance -= net.get(days[i]);
  }
  return rows.reverse();
}

function vMonthlySummary() {
  const byMonth = new Map();
  for (const t of vTransactions()) {
    const s = byMonth.get(t.month) || { month: t.month, income: 0, expenses: 0, transfers_out: 0, txn_count: 0, uncategorized_count: 0 };
    s.income += Number(t.income_amount);
    s.expenses += Number(t.expense_amount);
    if (t.kind === 'transfer' && t.direction === 'debit') s.transfers_out += Number(t.amount);
    s.txn_count += 1;
    if (t.category_id == null) s.uncategorized_count += 1;
    byMonth.set(t.month, s);
  }
  return [...byMonth.values()].map((s) => ({
    month: s.month,
    income: money(s.income),
    expenses: money(s.expenses),
    net: money(s.income - s.expenses),
    transfers_out: money(s.transfers_out),
    savings_rate: s.income > 0 ? ((s.income - s.expenses) / s.income).toFixed(4) : null,
    txn_count: s.txn_count,
    uncategorized_count: s.uncategorized_count,
  }));
}

function vMonthlyByCategory() {
  const groups = new Map();
  for (const t of vTransactions()) {
    const key = `${t.month}|${t.category_id}|${t.kind}`;
    const g = groups.get(key) || { month: t.month, category_id: t.category_id, category: t.category, parent_category: null, kind: t.kind || (t.direction === 'debit' ? 'expense' : 'income'), color: t.color, total: 0, txn_count: 0 };
    g.total += g.kind === 'income' ? Number(t.income_amount) : g.kind === 'expense' ? Number(t.expense_amount) : Number(t.amount);
    g.txn_count += 1;
    groups.set(key, g);
  }
  const rows = [...groups.values()];
  return rows.map((r) => {
    const kindTotal = rows.filter((o) => o.month === r.month && o.kind === r.kind).reduce((a, o) => a + o.total, 0);
    return { ...r, total: money(r.total), share_of_kind: kindTotal ? (r.total / kindTotal).toFixed(4) : null };
  });
}

function vDailySpend() {
  const days = new Map();
  for (const t of vTransactions()) {
    const spend = Number(t.expense_amount);
    if (!spend) continue;
    const d = days.get(t.txn_date) || { txn_date: t.txn_date, spend: 0, txn_count: 0 };
    d.spend += spend;
    d.txn_count += 1;
    days.set(t.txn_date, d);
  }
  return [...days.values()].map((d) => ({ ...d, spend: money(d.spend) }));
}

function vReviewQueue() {
  const groups = new Map();
  for (const t of txns) {
    if (t.category_id != null) continue;
    const key = `${t.description_norm}|${t.direction}`;
    const g = groups.get(key) || { description_norm: t.description_norm, sample_description: t.description, direction: t.direction, txn_count: 0, total_amount: 0, first_seen: t.txn_date, last_seen: t.txn_date };
    g.txn_count += 1;
    g.total_amount += Number(t.amount);
    if (t.txn_date < g.first_seen) g.first_seen = t.txn_date;
    if (t.txn_date > g.last_seen) g.last_seen = t.txn_date;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, total_amount: money(g.total_amount) }));
}

function vMerchantSummary() {
  const groups = new Map();
  for (const t of vTransactions()) {
    if (!t.merchant_name) continue;
    const g = groups.get(t.merchant_name) || { merchant_id: t.merchant_id, merchant_name: t.merchant_name, category: t.category, txn_count: 0, total_spend: 0, first_seen: t.txn_date, last_seen: t.txn_date };
    g.txn_count += 1;
    g.total_spend += Number(t.expense_amount);
    if (t.txn_date < g.first_seen) g.first_seen = t.txn_date;
    if (t.txn_date > g.last_seen) g.last_seen = t.txn_date;
    groups.set(t.merchant_name, g);
  }
  return [...groups.values()]
    .filter((g) => g.total_spend > 0)
    .map((g) => ({ ...g, total_spend: money(g.total_spend), avg_spend: money(g.total_spend / g.txn_count) }));
}

// ---- functions ------------------------------------------------------------

let nextMerchantId = 100;

function fin_categorize({ p_pattern, p_category_id, p_merchant_name = null, p_match_type = 'exact' }) {
  rules.push({ pattern: p_pattern, match_type: p_match_type, category_id: p_category_id, merchant_name: p_merchant_name });
  const merchantId = p_merchant_name ? nextMerchantId++ : null;
  let updated = 0;
  for (const t of txns) {
    if (t.category_source === 'manual') continue;
    const hit = p_match_type === 'prefix' ? t.description_norm.startsWith(p_pattern) : t.description_norm === p_pattern;
    if (!hit) continue;
    t.category_id = p_category_id;
    t.category_source = 'rule';
    if (p_merchant_name) {
      t.merchant_id = merchantId;
      t.merchant_name = p_merchant_name;
    }
    updated += 1;
  }
  return updated;
}

function fin_set_category({ p_txn_id, p_category_id, p_note = null }) {
  const t = txns.find((x) => x.id === Number(p_txn_id));
  if (!t) throw new Error('Transaction not found');
  t.category_id = p_category_id;
  t.category_source = 'manual';
  if (p_note != null) t.note = p_note;
  return null;
}

// ---- public interface used by api.js ---------------------------------------

const views = {
  v_transactions: vTransactions,
  v_monthly_summary: vMonthlySummary,
  v_monthly_by_category: vMonthlyByCategory,
  v_daily_spend: vDailySpend,
  v_review_queue: vReviewQueue,
  v_merchant_summary: vMerchantSummary,
  v_balance_daily: vBalanceDaily,
  v_budget_status: () => [],
  categories: () => categories.map((c) => ({ ...c })),
};

const functions = { fin_categorize, fin_set_category };

const delay = () => new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

// Returns a copy of all rows of a view; api.js applies the filters.
export async function select(view) {
  await delay();
  if (!views[view]) throw new Error(`Unknown view ${view}`);
  return structuredClone(views[view]());
}

export async function rpc(name, args) {
  await delay();
  if (!functions[name]) throw new Error(`Unknown function ${name}`);
  return functions[name](args);
}

export const mockUser = { id: 'mock-user', email: 'demo@example.com', name: 'Demo user' };
