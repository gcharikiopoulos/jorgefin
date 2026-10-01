// UI for the finance tracker. Every value that comes from the database is
// rendered with textContent (via h() below); no HTML is ever built from strings.

import * as api from './api.js';

// ---- formatting -------------------------------------------------------------

const moneyFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const signedFmt = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const percentFmt = new Intl.NumberFormat('el-GR', { style: 'percent', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('el-GR');
const monthFmt = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' });

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const money = (v) => moneyFmt.format(num(v));
const signedMoney = (v) => signedFmt.format(num(v));
const percent = (v) => percentFmt.format(num(v));
// 'YYYY-MM-DD' -> local Date (avoids the UTC shift of new Date('YYYY-MM-DD')).
function parseDate(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
const formatDate = (ymd) => (ymd ? dateFmt.format(parseDate(ymd)) : '');
const formatMonth = (ymd) => monthFmt.format(parseDate(ymd));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Fixed palette; categories.color is null for now, so colour is keyed by id.
const PALETTE = ['#2f6fdf', '#e8743b', '#19a979', '#ed4a7b', '#945ecf', '#13a4b4', '#d9a400', '#6c8893', '#c94a3c', '#5a9e3a', '#b76e9f', '#3d5a9e'];
const NO_CATEGORY_COLOR = '#9aa3ae';
function categoryColor(id, color) {
  if (color) return color;
  if (id == null) return NO_CATEGORY_COLOR;
  return PALETTE[Math.abs(Number(id)) % PALETTE.length];
}

// ---- DOM helpers --------------------------------------------------------------

const $ = (id) => document.getElementById(id);

// h('div', { class: 'x', text: 'safe text', onclick: fn, 'aria-label': '…' }, child, …)
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') el.textContent = value;
    else el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

function swatch(color) {
  return h('span', { class: 'swatch', style: { background: color }, 'aria-hidden': 'true' });
}

function categoryChip(name, id, color) {
  if (id == null) return h('span', { class: 'chip chip-none', text: 'Uncategorised' });
  return h('span', { class: 'chip' }, swatch(categoryColor(id, color)), name || 'Unknown');
}

// ---- loading / empty / error states -----------------------------------------------

function stateMessage(text, extraClass = '') {
  return h('div', { class: `state ${extraClass}`, text });
}

function errorState(err, retry) {
  console.error(err);
  const text = navigator.onLine ? 'Could not load this data.' : 'You are offline.';
  return h(
    'div',
    { class: 'state state-error', role: 'alert' },
    h('div', { text }),
    h('button', { class: 'btn', type: 'button', text: 'Retry', onclick: retry }),
  );
}

// Loads data into a container, showing loading, empty and error states.
async function loadInto(container, load, render, emptyText) {
  container.replaceChildren(stateMessage('Loading…', 'muted'));
  try {
    const data = await load();
    if (Array.isArray(data) && data.length === 0) {
      container.replaceChildren(stateMessage(emptyText));
    } else {
      container.replaceChildren(render(data));
    }
  } catch (err) {
    if (err instanceof api.AuthError) return handleAuthFailure(err);
    container.replaceChildren(errorState(err, () => loadInto(container, load, render, emptyText)));
  }
}

// ---- app state ------------------------------------------------------------------

const state = {
  user: null,
  months: [], // v_monthly_summary rows, newest first
  monthIndex: 0,
  categories: [],
  tab: 'overview',
  txns: null, // { month, rows } for the Transactions tab
};

const currentMonth = () => state.months[state.monthIndex] || null;
const categoryById = (id) => state.categories.find((c) => c.id === id) || null;

function categoryLabel(c) {
  const parent = c.parent_id != null ? categoryById(c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

// <select> of categories grouped by kind.
function categorySelect({ id, selected = null, placeholder = null, includeFilters = false }) {
  const select = h('select', { id, required: !includeFilters });
  if (includeFilters) {
    select.append(h('option', { value: '', text: 'All categories' }));
    select.append(h('option', { value: 'none', text: 'Uncategorised' }));
  } else if (placeholder) {
    select.append(h('option', { value: '', text: placeholder, disabled: true, selected: selected == null }));
  }
  const kinds = [['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];
  for (const [kind, label] of kinds) {
    const items = state.categories.filter((c) => c.kind === kind);
    if (!items.length) continue;
    const group = h('optgroup', { label });
    for (const c of items) {
      group.append(h('option', { value: String(c.id), text: categoryLabel(c), selected: c.id === selected }));
    }
    select.append(group);
  }
  return select;
}

// ---- screens -----------------------------------------------------------------

function showScreen(name) {
  for (const id of ['loading', 'signin', 'denied', 'app']) $(`screen-${id}`).hidden = id !== name;
}

function showSignIn(message = '') {
  state.user = null;
  $('signin-error').textContent = message;
  $('signin-error').hidden = !message;
  showScreen('signin');
}

function showDenied(user) {
  $('denied-email').textContent = user?.email || 'this account';
  showScreen('denied');
}

async function handleAuthFailure(err) {
  console.error('Auth failure', err);
  try {
    const user = await api.getUser();
    if (user) showDenied(user);
    else showSignIn('Your session has ended. Please sign in again.');
  } catch (e) {
    console.error(e);
    showSignIn('Please sign in again.');
  }
}

// Reads ?error= left by a failed OAuth redirect and removes it from the URL.
function takeSignInError() {
  const url = new URL(location.href);
  const code = url.searchParams.get('error');
  if (!code) return '';
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  history.replaceState(history.state, '', url.href);
  return `Sign-in did not complete (${code}). Please try again.`;
}

let bootedOffline = false;

async function boot() {
  showScreen('loading');
  bootedOffline = false;
  const signInError = takeSignInError();

  try {
    state.user = await api.getUser();
  } catch (err) {
    console.error(err);
    if (!navigator.onLine) return showOfflineShell();
    return showSignIn(err.message.includes('config.js') ? err.message : 'Could not reach the sign-in service. Please try again.');
  }
  if (!state.user) return showSignIn(signInError);

  try {
    const [months, categories] = await Promise.all([api.getMonthlySummary(), api.getCategories()]);
    if (!months.length) return showDenied(state.user);
    state.months = months;
    state.monthIndex = 0; // latest month with data, not the calendar month
    state.categories = categories;
  } catch (err) {
    if (err instanceof api.AuthError) return showDenied(state.user);
    console.error(err);
    if (!navigator.onLine) return showOfflineShell();
    showScreen('app');
    $('tab-overview').replaceChildren(errorState(err, boot));
    return;
  }

  populateCategoryFilter();
  updateReviewBadge();
  showScreen('app');
  switchTab(state.tab);
}

// Shell with an offline message; retries automatically when back online.
function showOfflineShell() {
  bootedOffline = true;
  showScreen('app');
  $('month-label').textContent = '';
  $('tab-overview').replaceChildren(errorState(new Error('Offline at start-up'), boot));
}

// ---- tabs and month picker ---------------------------------------------------------

function switchTab(tab) {
  state.tab = tab;
  for (const btn of document.querySelectorAll('.tabbar-btn')) {
    if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  for (const name of ['overview', 'transactions', 'review']) $(`tab-${name}`).hidden = name !== tab;
  $('month-picker').hidden = tab === 'review' || !currentMonth();
  updateMonthPicker();
  if (tab === 'overview') renderOverview();
  if (tab === 'transactions') renderTransactions();
  if (tab === 'review') renderReview();
  window.scrollTo(0, 0);
}

function updateMonthPicker() {
  const m = currentMonth();
  $('month-label').textContent = m ? formatMonth(m.month) : '';
  $('btn-prev-month').disabled = state.monthIndex >= state.months.length - 1;
  $('btn-next-month').disabled = state.monthIndex <= 0;
}

function changeMonth(delta) {
  const next = state.monthIndex + delta;
  if (next < 0 || next >= state.months.length) return;
  state.monthIndex = next;
  updateMonthPicker();
  if (state.tab === 'overview') renderOverview();
  if (state.tab === 'transactions') renderTransactions();
}

// Reloads the monthly summary after a write, keeping the selected month.
async function refreshSummary() {
  const selected = currentMonth()?.month;
  try {
    const months = await api.getMonthlySummary();
    if (months.length) {
      state.months = months;
      const idx = months.findIndex((m) => m.month === selected);
      state.monthIndex = idx >= 0 ? idx : 0;
    }
  } catch (err) {
    console.error('Could not refresh summary', err);
  }
  updateReviewBadge();
  updateMonthPicker();
}

function updateReviewBadge() {
  const total = state.months.reduce((sum, m) => sum + num(m.uncategorized_count), 0);
  $('review-count').textContent = total > 99 ? '99+' : String(total);
  $('review-count').hidden = total === 0;
}

// ---- Overview ---------------------------------------------------------------------

function renderOverview() {
  const root = $('tab-overview');
  const m = currentMonth();
  if (!m) {
    root.replaceChildren(stateMessage('No data yet.'));
    return;
  }

  const net = num(m.net);
  const figures = h(
    'div',
    { class: 'figures' },
    figure('Income', money(m.income)),
    figure('Expenses', money(m.expenses)),
    figure('Net', signedMoney(net), net > 0 ? 'positive' : net < 0 ? 'negative' : ''),
  );

  const uncategorised = num(m.uncategorized_count);
  const notice = uncategorised > 0
    ? h(
      'div',
      { class: 'notice' },
      h('span', { text: `${plural(uncategorised, 'transaction')} this month need a category.` }),
      h('button', { class: 'btn-link', type: 'button', text: 'Review', onclick: () => switchTab('review') }),
    )
    : null;

  const breakdown = h('div');
  const daily = h('div');
  root.replaceChildren(
    figures,
    notice,
    h('section', { class: 'card' }, h('h3', { text: 'Spending by category' }), breakdown),
    h('section', { class: 'card' }, h('h3', { text: 'Daily spending' }), daily),
  );

  loadInto(breakdown, () => api.getCategoryBreakdown(m.month, 'expense'), renderCategoryBars, 'No spending this month.');
  loadInto(daily, () => api.getDailySpend(m.month), (rows) => renderDailyChart(rows, m.month), 'No spending this month.');
}

function figure(label, value, tone = '') {
  return h('div', { class: 'figure' }, h('div', { class: 'figure-label', text: label }), h('div', { class: `figure-value ${tone}`, text: value }));
}

function renderCategoryBars(rows) {
  const total = rows.reduce((sum, r) => sum + num(r.total), 0);
  const max = Math.max(...rows.map((r) => num(r.total)), 0);
  const list = h('ul', { class: 'bars' });
  for (const r of rows) {
    const share = r.share_of_kind != null ? num(r.share_of_kind) : total ? num(r.total) / total : 0;
    const color = categoryColor(r.category_id, r.color);
    const width = max ? `${Math.max(2, (num(r.total) / max) * 100)}%` : '0';
    list.append(
      h(
        'li',
        {},
        h(
          'div',
          { class: 'bar-head' },
          h('span', { class: 'bar-name' }, swatch(color), h('span', { text: r.category_id == null ? 'Uncategorised' : r.category || 'Unknown' })),
          h('span', { class: 'bar-amount' }, money(r.total), h('small', { text: percent(share) })),
        ),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width, background: color } })),
      ),
    );
  }
  return list;
}

function renderDailyChart(rows, month) {
  const start = parseDate(month);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const byDay = new Map(rows.map((r) => [parseDate(r.txn_date).getDate(), r]));
  const max = Math.max(...rows.map((r) => num(r.spend)), 0) || 1;

  const W = 340;
  const H = 150;
  const pad = { top: 18, right: 4, bottom: 18, left: 4 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const step = plotW / days;
  const barW = Math.max(2, step - 2);

  const svgEl = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Daily spending, highest day ${money(max)}` });
  svgEl.append(s('text', { x: pad.left, y: 11, text: `max ${money(max)}` }));
  svgEl.append(s('line', { class: 'axis', x1: pad.left, x2: W - pad.right, y1: pad.top + plotH, y2: pad.top + plotH }));

  for (let d = 1; d <= days; d++) {
    const x = pad.left + (d - 1) * step + (step - barW) / 2;
    const r = byDay.get(d);
    if (r) {
      const bh = Math.max(1, (num(r.spend) / max) * plotH);
      svgEl.append(
        s('rect', { class: 'bar', x: x.toFixed(1), y: (pad.top + plotH - bh).toFixed(1), width: barW.toFixed(1), height: bh.toFixed(1), rx: 1.5 },
          s('title', { text: `${formatDate(r.txn_date)}: ${money(r.spend)} (${plural(num(r.txn_count), 'transaction')})` })),
      );
    }
    if (d === 1 || d % 7 === 1 || d === days) {
      const anchor = d === 1 ? 'start' : d === days ? 'end' : 'middle';
      const tx = d === 1 ? pad.left : d === days ? W - pad.right : x + barW / 2;
      svgEl.append(s('text', { x: tx.toFixed(1), y: H - 4, 'text-anchor': anchor, text: String(d) }));
    }
  }
  return svgEl;
}

// ---- Transactions ---------------------------------------------------------------

function populateCategoryFilter() {
  const old = $('txn-category');
  const value = old.value;
  const fresh = categorySelect({ id: 'txn-category', includeFilters: true });
  fresh.setAttribute('aria-label', 'Filter by category');
  fresh.value = value;
  fresh.addEventListener('change', renderTxnList);
  old.replaceWith(fresh);
}

function renderTransactions() {
  const m = currentMonth();
  const list = $('txn-list');
  if (!m) {
    list.replaceChildren(stateMessage('No data yet.'));
    return;
  }
  if (state.txns?.month === m.month) {
    renderTxnList();
    return;
  }
  loadInto(
    list,
    async () => {
      const rows = await api.getTransactions(m.month);
      state.txns = { month: m.month, rows };
      return rows;
    },
    buildTxnList,
    'No transactions this month.',
  );
}

function filteredTxns() {
  const query = $('txn-search').value.trim().toLocaleLowerCase();
  const cat = $('txn-category').value;
  return (state.txns?.rows || []).filter((t) => {
    if (cat === 'none' && t.category_id != null) return false;
    if (cat && cat !== 'none' && String(t.category_id) !== cat) return false;
    if (!query) return true;
    return [t.merchant_name, t.description].some((v) => v && v.toLocaleLowerCase().includes(query));
  });
}

function renderTxnList() {
  if (!state.txns || state.txns.month !== currentMonth()?.month) return;
  $('txn-list').replaceChildren(state.txns.rows.length ? buildTxnList() : stateMessage('No transactions this month.'));
}

function buildTxnList() {
  const rows = filteredTxns();
  const all = state.txns.rows.length;
  if (!rows.length) return stateMessage('No transactions match your filters.');
  const meta = h('p', { class: 'list-meta', text: rows.length === all ? plural(all, 'transaction') : `${rows.length} of ${all} transactions` });
  const list = h('ul', { class: 'list' });
  for (const t of rows) {
    const credit = t.direction === 'credit';
    const signed = t.signed_amount != null ? num(t.signed_amount) : credit ? num(t.amount) : -num(t.amount);
    list.append(
      h(
        'li',
        {},
        h(
          'button',
          { class: 'row', type: 'button', onclick: () => openTxnSheet(t) },
          h('span', { class: 'row-title', text: t.merchant_name || t.description || '—' }),
          h('span', { class: `row-amount ${credit ? 'credit' : ''}`, text: signedMoney(signed) }),
          h('span', { class: 'row-sub' }, h('span', { text: formatDate(t.txn_date) }), categoryChip(t.category, t.category_id, t.color)),
        ),
      ),
    );
  }
  return h('div', {}, meta, list);
}

function openTxnSheet(t) {
  const select = categorySelect({ id: 'sheet-category', selected: t.category_id, placeholder: 'Choose a category' });
  const note = h('input', { id: 'sheet-note', type: 'text', maxlength: '200', value: t.note || '', autocomplete: 'off' });
  openSheet({
    title: 'Change category',
    content: [
      h(
        'div',
        { class: 'sheet-summary' },
        h('div', { text: t.merchant_name || t.description || '—' }),
        t.merchant_name ? h('div', { text: t.description }) : null,
        h('div', { text: `${formatDate(t.txn_date)} · ${signedMoney(t.signed_amount ?? (t.direction === 'credit' ? t.amount : -num(t.amount)))}` }),
      ),
      h('label', { class: 'field' }, h('span', { text: 'Category' }), select),
      h('label', { class: 'field' }, h('span', { text: 'Note (optional)' }), note),
    ],
    onSave: async () => {
      const categoryId = Number(select.value);
      if (!categoryId) throw new Error('Choose a category.');
      await api.setCategory({ txnId: t.id, categoryId, note: note.value.trim() || null });
      toast('Category updated');
      state.txns = null;
      await refreshSummary();
      renderTransactions();
    },
  });
}

// ---- Review ------------------------------------------------------------------

function renderReview() {
  const root = $('tab-review');
  const list = h('div');
  root.replaceChildren(h('p', { class: 'list-meta', text: 'Uncategorised transactions, grouped by description.' }), list);
  loadInto(list, api.getReviewQueue, buildReviewList, 'Nothing to review. Every transaction has a category.');
}

function buildReviewList(items) {
  const list = h('ul', { class: 'list' });
  for (const item of items) {
    const credit = item.direction === 'credit';
    const count = num(item.txn_count);
    const range = item.first_seen === item.last_seen ? formatDate(item.first_seen) : `${formatDate(item.first_seen)} – ${formatDate(item.last_seen)}`;
    list.append(
      h(
        'li',
        {},
        h(
          'button',
          { class: 'row', type: 'button', onclick: () => openReviewSheet(item) },
          h('span', { class: 'row-title', text: item.sample_description || item.description_norm }),
          h('span', { class: `row-amount ${credit ? 'credit' : ''}` }, signedMoney(credit ? num(item.total_amount) : -num(item.total_amount)), h('small', { text: plural(count, 'txn') })),
          h('span', { class: 'row-sub', text: range }),
        ),
      ),
    );
  }
  return list;
}

function openReviewSheet(item) {
  const select = categorySelect({ id: 'sheet-category', placeholder: 'Choose a category' });
  const merchant = h('input', { id: 'sheet-merchant', type: 'text', maxlength: '80', placeholder: 'e.g. Corner shop', autocomplete: 'off' });
  const radio = (value, label, checked) =>
    h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'match-type', value, checked }), h('span', { text: label }));
  openSheet({
    title: 'Categorise',
    content: [
      h(
        'div',
        { class: 'sheet-summary' },
        h('div', { text: item.sample_description || item.description_norm }),
        h('div', { text: `${plural(num(item.txn_count), 'transaction')} · ${money(item.total_amount)}` }),
        h('div', { text: `Pattern: ${item.description_norm}` }),
      ),
      h('label', { class: 'field' }, h('span', { text: 'Category' }), select),
      h('label', { class: 'field' }, h('span', { text: 'Merchant name (optional)' }), merchant),
      h(
        'fieldset',
        { class: 'field' },
        h('legend', { text: 'Match' }),
        radio('exact', 'Exact description', true),
        radio('prefix', 'Descriptions starting with this pattern', false),
      ),
    ],
    saveLabel: 'Apply',
    onSave: async () => {
      const categoryId = Number(select.value);
      if (!categoryId) throw new Error('Choose a category.');
      const matchType = document.querySelector('input[name="match-type"]:checked')?.value || 'exact';
      const updated = await api.categorize({
        pattern: item.description_norm,
        categoryId,
        merchantName: merchant.value.trim() || null,
        matchType,
      });
      toast(`Updated ${plural(updated, 'transaction')}`);
      state.txns = null;
      await refreshSummary();
      renderReview();
    },
  });
}

// ---- sheet and toast ---------------------------------------------------------------

let sheetSave = null;

function openSheet({ title, content, onSave, saveLabel = 'Save' }) {
  $('sheet-title').textContent = title;
  $('sheet-content').replaceChildren(...content.filter(Boolean));
  $('sheet-error').hidden = true;
  $('sheet-save').textContent = saveLabel;
  $('sheet-save').disabled = false;
  sheetSave = onSave;
  $('sheet').showModal();
}

function closeSheet() {
  sheetSave = null;
  $('sheet').close();
}

async function submitSheet(event) {
  event.preventDefault();
  if (!sheetSave) return;
  const button = $('sheet-save');
  button.disabled = true;
  $('sheet-error').hidden = true;
  try {
    await sheetSave();
    closeSheet();
  } catch (err) {
    if (err instanceof api.AuthError) {
      closeSheet();
      return handleAuthFailure(err);
    }
    console.error(err);
    $('sheet-error').textContent = err.message === 'Choose a category.' ? err.message : navigator.onLine ? 'Could not save. Please try again.' : 'You are offline.';
    $('sheet-error').hidden = false;
    button.disabled = false;
  }
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---- wiring ----------------------------------------------------------------------

function updateOnlineStatus() {
  $('offline-banner').hidden = navigator.onLine;
  if (navigator.onLine && bootedOffline) boot();
}

function init() {
  $('mock-badge').hidden = !api.isMock;

  $('btn-signin').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    $('signin-error').hidden = true;
    try {
      if (api.isMock) return await boot();
      await api.signInWithGoogle(); // navigates away on success
    } catch (err) {
      console.error(err);
      showSignIn(navigator.onLine ? 'Could not start sign-in. Please try again.' : 'You are offline.');
    } finally {
      button.disabled = false;
    }
  });

  const doSignOut = async () => {
    await api.signOut();
    state.months = [];
    state.txns = null;
    state.tab = 'overview';
    showSignIn();
  };
  $('btn-signout').addEventListener('click', doSignOut);
  $('btn-denied-signout').addEventListener('click', doSignOut);

  for (const btn of document.querySelectorAll('.tabbar-btn')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }
  $('btn-prev-month').addEventListener('click', () => changeMonth(1));
  $('btn-next-month').addEventListener('click', () => changeMonth(-1));
  $('txn-search').addEventListener('input', renderTxnList);
  $('txn-category').addEventListener('change', renderTxnList);

  $('sheet-form').addEventListener('submit', submitSheet);
  $('sheet-cancel').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (event) => {
    if (event.target === $('sheet')) closeSheet(); // tap on the backdrop
  });

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  $('offline-banner').hidden = navigator.onLine;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((err) => console.error('Service worker registration failed', err));
  }

  boot();
}

init();
