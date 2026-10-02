// Formatting and colour helpers shared by the dashboard and lists.

import { num } from './backend.js';

const moneyFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const signedFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const compactFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const percentFmts = [0, 1].map((d) => new Intl.NumberFormat('el-GR', { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }));
const amountFmt = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('el-GR');
const monthFmt = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat('el-GR', { month: 'short', year: '2-digit' });
const dayMonthFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit' });

export const money = (v) => moneyFmt.format(num(v));
export const signedMoney = (v) => signedFmt.format(num(v));
export const compactMoney = (v) => compactFmt.format(num(v));
export const percent = (v, digits = 0) => percentFmts[digits ? 1 : 0].format(num(v));

// Plain figures for dense tables and readouts, where the column says it is euros.
export const amount = (v) => amountFmt.format(num(v));
export const signedAmount = (v) => {
  const n = num(v);
  return (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + amountFmt.format(Math.abs(n));
};
// Axis labels: 0, 500, 1,5k, 2k.
export const axisAmount = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('el-GR', { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

// 'YYYY-MM-DD' -> local Date (avoids the UTC shift of new Date('YYYY-MM-DD')).
export function parseDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const formatDate = (ymd) => (ymd ? dateFmt.format(parseDate(ymd)) : '');
export const formatMonth = (ymd) => (ymd ? monthFmt.format(parseDate(ymd)) : '');
export const formatShortMonth = (ymd) => (ymd ? shortMonthFmt.format(parseDate(ymd)) : '');
export const formatDayMonth = (ymd) => (ymd ? dayMonthFmt.format(parseDate(ymd)) : '');

// Time of a transaction (timestamptz) in Athens time; '' when the source has no time.
const timeFmt = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Athens' });
export const formatTime = (ts) => (ts ? timeFmt.format(new Date(ts)) : '');

const TXN_TYPES = {
  card_purchase: 'Card purchase',
  card_refund: 'Card refund',
  atm_withdrawal: 'Cash withdrawal',
  transfer: 'Transfer',
  payment: 'Payment',
  card: 'Card purchase',
  transfer_in: 'Transfer',
};
export const txnTypeLabel = (type) => TXN_TYPES[type] || '';

const SOURCES = {
  statement_csv: 'Bank statement',
  account_alert: 'Account alert email',
  card_alert: 'Card alert email',
  manual: 'Entered by hand',
  mock: 'Demo data',
};
export const sourceLabel = (source) => SOURCES[source] || source || '';

// Four-letter source tags for dense tables.
const SOURCE_TAGS = { card_alert: 'CARD', account_alert: 'ACCT', statement_csv: 'STMT', manual: 'MAN', mock: 'DEMO' };
export const sourceShort = (source) => SOURCE_TAGS[source] || (source ? String(source).slice(0, 4).toUpperCase() : '');

// Name to show for a transaction, plus the bank's description when it says something different.
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
export const sameText = (a, b) => plain(a) === plain(b);

// Same result as the database's fin_normalize: upper case, Greek accents dropped,
// Greek capitals that look Latin turned into Latin, '_' as a space, single spaces.
// Rules match on this, so "starts with" previews use it too.
const GREEK_TO_LATIN = { 'Ά': 'A', 'Έ': 'E', 'Ή': 'H', 'Ί': 'I', 'Ό': 'O', 'Ύ': 'Y', 'Ώ': 'Ω', 'Ϊ': 'I', 'Ϋ': 'Y', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', '_': ' ' };
export const normalizeText = (s) => String(s || '').trim().replace(/^="?|"$/g, '').toUpperCase().replace(/[ΆΈΉΊΌΎΏΪΫΑΒΕΖΗΙΚΜΝΟΡΤΥΧ_]/g, (c) => GREEK_TO_LATIN[c]).replace(/\s+/g, ' ').trim();

// A "starts with" pattern for a description: the leading words before the first
// one with a digit in it (reference codes), without trailing punctuation.
// "SPOTIFY P36DD67B53" -> "SPOTIFY", "FREENOW* D6UAZZ-2" -> "FREENOW".
export function suggestPrefix(description) {
  const words = normalizeText(description).split(' ');
  const lead = [];
  for (const w of words) {
    if (/\d/.test(w)) break;
    lead.push(w);
  }
  return (lead.join(' ') || words[0] || '').replace(/[^\p{L}\p{N}]+$/u, '');
}
export function txnName(t) {
  const name = t.merchant_name || t.description || '';
  return { name, detail: t.description && !sameText(name, t.description) ? t.description : '' };
}

// Validated categorical palette (8 slots, fixed order) for light and dark surfaces.
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
export const OTHER_COLOR = '#898781';
export const REST_COLOR = '#c3c2b7';

export const seriesColor = (slot, mode = 'light') => SERIES[mode === 'dark' ? 'dark' : 'light'][slot] ?? OTHER_COLOR;

// Swatches offered when editing a category (the first 12 are what new databases start with).
export const CATEGORY_SWATCHES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7',
  '#e34948', '#0e9aa7', '#8a5a44', '#b04fc6', '#7d9c1f', '#d4719a',
  '#0b8a3e', '#5aa469', '#2e7d6b', '#6c8893', '#8a94a6', '#5f7a8a',
];

// A category's colour: its own, else its parent's, else a fallback by kind.
// The category list is the source of truth (it reflects edits straight away);
// a colour carried on a row is only used when the category is not in the list.
export function categoryColor(categoryId, categories, mode, rowColor) {
  if (categoryId == null) return OTHER_COLOR;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return rowColor || OTHER_COLOR;
  if (cat.color) return cat.color;
  const parent = cat.parent_id != null ? categories.find((c) => c.id === cat.parent_id) : null;
  if (parent?.color) return parent.color;
  if (cat.kind === 'income') return mode === 'dark' ? '#2fbf62' : '#0b8a3e';
  if (cat.kind === 'transfer') return mode === 'dark' ? '#8fa3b8' : '#6c8893';
  const top = parent || cat;
  const expenses = categories.filter((c) => c.kind === 'expense' && c.parent_id == null).sort((a, b) => a.sort_order - b.sort_order);
  return seriesColor(expenses.findIndex((c) => c.id === top.id), mode);
}

// Top-level categories in display order, each with its children: [{ ...parent, children: [...] }].
export function categoryTree(categories, kind) {
  const bySort = (a, b) => a.sort_order - b.sort_order || a.id - b.id;
  return categories
    .filter((c) => c.parent_id == null && (!kind || c.kind === kind))
    .sort(bySort)
    .map((p) => ({ ...p, children: categories.filter((c) => c.parent_id === p.id).sort(bySort) }));
}

// "Parent › Child" for a subcategory, the plain name otherwise.
export function categoryLabel(category, categories) {
  if (!category) return '';
  const parent = category.parent_id != null ? categories.find((c) => c.id === category.parent_id) : null;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}
