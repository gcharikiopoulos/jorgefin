// Formatting and colour helpers shared by the dashboard and lists.

import { num } from './backend.js';

const moneyFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const signedFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const compactFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat('el-GR', { style: 'percent', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('el-GR');
const monthFmt = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat('el-GR', { month: 'short', year: '2-digit' });

export const money = (v) => moneyFmt.format(num(v));
export const signedMoney = (v) => signedFmt.format(num(v));
export const compactMoney = (v) => compactFmt.format(num(v));
export const percent = (v) => percentFmt.format(num(v));

// 'YYYY-MM-DD' -> local Date (avoids the UTC shift of new Date('YYYY-MM-DD')).
export function parseDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const formatDate = (ymd) => (ymd ? dateFmt.format(parseDate(ymd)) : '');
export const formatMonth = (ymd) => (ymd ? monthFmt.format(parseDate(ymd)) : '');
export const formatShortMonth = (ymd) => (ymd ? shortMonthFmt.format(parseDate(ymd)) : '');

// Validated categorical palette (8 slots, fixed order) for light and dark surfaces.
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
export const OTHER_COLOR = '#898781';
export const REST_COLOR = '#c3c2b7';

export const seriesColor = (slot, mode = 'light') => SERIES[mode === 'dark' ? 'dark' : 'light'][slot] ?? OTHER_COLOR;

// Colour follows the category, never its rank: an expense category's slot is its
// position among expense categories (by sort_order); past the 8th it folds to grey.
// Income is green and transfers neutral, so they never borrow an expense hue.
export function categoryColor(categoryId, categories, mode, explicitColor) {
  if (explicitColor) return explicitColor;
  if (categoryId == null) return OTHER_COLOR;
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return OTHER_COLOR;
  if (cat.kind === 'income') return mode === 'dark' ? '#2fbf62' : '#0b8a3e';
  if (cat.kind === 'transfer') return mode === 'dark' ? '#8fa3b8' : '#6c8893';
  const expenses = categories.filter((c) => c.kind === 'expense').sort((a, b) => a.sort_order - b.sort_order);
  return seriesColor(expenses.findIndex((c) => c.id === cat.id), mode);
}
