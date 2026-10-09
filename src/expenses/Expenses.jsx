// Expenses: one month's spending by category, compared with the month before and
// with your recent average; a 12-month heatmap by category; and the merchants and
// transactions behind any category. A year of expense rows is fetched once and
// everything (filters, sorting, comparisons) is worked out in the browser.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Skeleton, Stack, TextField, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Title, useDataProvider } from 'react-admin';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useCategories, useMonths } from '../hooks.js';
import { num } from '../backend.js';
import { amount, axisAmount, categoryColor, formatDayMonth, formatMonth, formatShortMonth, txnName } from '../format.js';
import { EmptyOrDenied, avg, thisMonth, transactionsLink } from '../dashboard/Dashboard.jsx';
import { Card, Figure, MonthSwitch, TextLink } from '../dashboard/Overview.jsx';
import { SortTh, sortRows } from '../components/SortTh.jsx';
import { Segments } from '../components/PrefixField.jsx';
import { hideBelowMd, hideBelowSm, tableSx, tdSx, thSx, CONTROL } from '../components/dense.js';

const WINDOW = 12; // months fetched and shown in the heatmap
const AVERAGE_MONTHS = 6;
const MIN_OPTIONS = [[0, 'Any amount'], [10, '10 € or more'], [50, '50 € or more'], [100, '100 € or more'], [500, '500 € or more']];
const PAGE = 50;

const euro = (v) => `${amount(v)} €`;
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const daysIn = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
// Money out counts as spending, refunds and reimbursements count against it.
const spendOf = (r) => -num(r.signed_amount);
const pctChange = (now, before) => (before ? (now - before) / before : null);

export function Expenses() {
  const monthsQuery = useMonths();
  const [params, setParams] = useSearchParams();
  const months = monthsQuery.data || [];
  if (monthsQuery.isPending) return <Box sx={{ pt: 2 }}><Skeleton variant="rounded" height={420} /></Box>;
  if (!months.length) return <EmptyOrDenied />;
  let index = months.findIndex((m) => m.month === params.get('month'));
  if (index < 0) index = 0;
  const onMonth = (i) => {
    const next = new URLSearchParams(params);
    next.set('month', months[i].month);
    setParams(next, { replace: true });
  };
  return <ExpensesPage months={months} index={index} onMonth={onMonth} />;
}

// ---------- data shaping ----------

function emptyNode(key, label, winMonths) {
  return { key, label, byMonth: Object.fromEntries(winMonths.map((m) => [m, 0])), count: 0, gross: 0, subs: new Map() };
}

function finish(node, { month, prevMonth, avgMonths, total, winMonths }) {
  const cur = node.byMonth[month] || 0;
  const prev = node.byMonth[prevMonth] ?? null;
  const average = avgMonths.length ? avg(avgMonths.map((m) => node.byMonth[m] || 0)) : null;
  return {
    ...node,
    cur,
    prev,
    average,
    share: total ? cur / total : 0,
    delta: average == null ? null : cur - average,
    ticket: node.count ? node.gross / node.count : null,
    spark: winMonths.map((m) => node.byMonth[m] || 0),
  };
}

// ---------- page ----------

function ExpensesPage({ months, index, onMonth }) {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const month = months[index].month;
  const from = addMonths(month, -(WINDOW - 1));
  const to = addMonths(month, 1);
  const query = useQuery({ queryKey: ['expenses', from, to], queryFn: () => dataProvider.getExpenses(from, to), placeholderData: keepPreviousData });
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: () => dataProvider.getAccounts(), staleTime: 5 * 60_000 });
  const { data: categories = [] } = useCategories();
  const [filters, setFilters] = useState({ account: '', group: '', q: '', min: 0, noCash: false });
  const [focus, setFocus] = useState(null); // { key, label, top } narrows the merchants/transactions card

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const topOf = (id) => {
    if (id == null) return 'none';
    const c = catById.get(id);
    return c ? (c.parent_id ?? c.id) : id;
  };
  const nameOf = (id) => (id === 'none' ? 'Uncategorised' : catById.get(id)?.name || 'Unknown');
  const colorOf = (id) => (id === 'none' ? theme.palette.cockpit.warn : categoryColor(id, categories, theme.palette.mode));
  const cashIds = categories.filter((c) => /cash withdrawal|αναληψ/i.test(c.name)).map((c) => c.id);
  const accounts = accountsQuery.data || [];
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';

  const winMonths = Array.from({ length: WINDOW }, (_, i) => addMonths(from, i));
  const prevMonth = addMonths(month, -1);
  const known = new Set(months.map((m) => m.month));
  const avgMonths = winMonths.filter((m) => m < month && known.has(m)).slice(-AVERAGE_MONTHS);
  const running = month === thisMonth();

  const needle = filters.q.trim().toLowerCase();
  const rows = (query.data || []).filter((r) => {
    if (filters.account && String(r.account_id) !== filters.account) return false;
    if (filters.group && String(topOf(r.category_id)) !== filters.group) return false;
    if (filters.noCash && cashIds.includes(r.category_id)) return false;
    if (filters.min && Math.abs(num(r.signed_amount)) < filters.min) return false;
    if (needle && !`${r.merchant_name || ''} ${r.description || ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  // Totals by month, and by category (top-level, with subcategories inside).
  const totals = Object.fromEntries(winMonths.map((m) => [m, 0]));
  const groups = new Map();
  for (const r of rows) {
    const s = spendOf(r);
    if (!(r.month in totals)) continue;
    totals[r.month] += s;
    const top = topOf(r.category_id);
    const g = groups.get(top) || emptyNode(top, nameOf(top), winMonths);
    const subKey = r.category_id ?? 'none';
    const sub = g.subs.get(subKey) || emptyNode(subKey, subKey === top ? `${nameOf(top)} (general)` : nameOf(subKey), winMonths);
    for (const n of [g, sub]) {
      n.byMonth[r.month] += s;
      if (r.month === month && r.direction !== 'credit') { n.count += 1; n.gross += num(r.amount); }
    }
    g.subs.set(subKey, sub);
    groups.set(top, g);
  }
  const total = totals[month] || 0;
  const ctx = { month, prevMonth, avgMonths, total, winMonths };
  const cats = [...groups.values()].map((g) => {
    const subs = [...g.subs.values()].map((s) => finish(s, ctx)).filter((s) => s.cur || s.average);
    return { ...finish(g, ctx), color: colorOf(g.key), subs: subs.length > 1 || (subs[0] && subs[0].key !== g.key) ? subs : [] };
  }).filter((c) => c.cur || c.average);

  const monthRows = rows.filter((r) => r.month === month);
  const debits = monthRows.filter((r) => r.direction !== 'credit');
  const prevTotal = known.has(prevMonth) ? totals[prevMonth] : null;
  const avgTotal = avgMonths.length ? avg(avgMonths.map((m) => totals[m])) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 }, pt: { xs: 1.5, md: 2 }, pb: 4 }}>
      <Title title="Expenses" />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 600 }}>Expenses</Typography>
        <MonthSwitch months={months} index={index} onChange={onMonth} />
      </Stack>

      <FilterBar filters={filters} setFilters={setFilters} accounts={accounts.filter((a) => a.kind !== 'investment')} categories={categories} hasCash={cashIds.length > 0} />

      {query.isPending ? <Skeleton variant="rounded" height={140} /> : (
        <Kpis total={total} prevTotal={prevTotal} avgTotal={avgTotal} debits={debits} month={month} running={running} cats={cats} />
      )}

      <Card title="By category" link={<TextLink to={transactionsLink({ month })}>All transactions ›</TextLink>}>
        {query.isPending ? <Skeleton variant="rounded" height={320} /> : (
          <CategoryTable cats={cats} total={total} prevTotal={prevTotal} avgTotal={avgTotal} winMonths={winMonths} focus={focus}
            onFocus={(node, top) => setFocus((f) => (f?.key === node.key ? null : { key: node.key, label: node.label, top }))} />
        )}
      </Card>

      <Card title="Last 12 months" link={<Typography sx={{ fontSize: 13, color: 'cockpit.tx3', display: { xs: 'none', md: 'block' } }}>Darker = more than that category's usual · click a month to open it</Typography>}>
        {query.isPending ? <Skeleton variant="rounded" height={260} /> : (
          <Heatmap cats={cats} totals={totals} winMonths={winMonths} month={month} known={known}
            onMonth={(m) => { const i = months.findIndex((x) => x.month === m); if (i >= 0) onMonth(i); }} />
        )}
      </Card>

      <Card title={focus ? `${focus.label} · ${formatMonth(month)}` : `Where it went · ${formatMonth(month)}`}
        link={focus && <Button onClick={() => setFocus(null)} sx={{ minHeight: 32 }}>Show all categories ×</Button>}>
        {query.isPending ? <Skeleton variant="rounded" height={260} /> : (
          <Details rows={monthRows.filter((r) => !focus || (focus.top ? String(topOf(r.category_id)) === String(focus.key) : String(r.category_id ?? 'none') === String(focus.key)))}
            prevRows={rows.filter((r) => r.month === prevMonth)} nameOf={nameOf} topOf={topOf} colorOf={colorOf} accountName={accountName} />
        )}
      </Card>
    </Box>
  );
}

// ---------- filters ----------

function Field({ label, value, onChange, children, width = 180 }) {
  return (
    <TextField select size="small" fullWidth={false} label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ m: 0, width: { xs: '100%', sm: width } }}>
      {children}
    </TextField>
  );
}

function FilterBar({ filters, setFilters, accounts, categories, hasCash }) {
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));
  const tops = categories.filter((c) => c.kind === 'expense' && c.parent_id == null);
  const active = filters.account || filters.group || filters.q || filters.min || filters.noCash;
  const count = [filters.account, filters.group, filters.min, filters.noCash].filter(Boolean).length;
  const [open, setOpen] = useState(false); // phones: the filters fold away behind one button
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25, bgcolor: 'cockpit.panel', borderRadius: '14px', p: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" sx={{ gap: 1, width: { xs: '100%', sm: 'auto' } }}>
        <TextField size="small" fullWidth={false} label="Merchant or description" value={filters.q} onChange={(e) => set('q')(e.target.value)} sx={{ m: 0, width: { xs: 'auto', sm: 260 }, flex: { xs: 1, sm: 'none' } }} />
        <Button variant="outlined" onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ display: { xs: 'inline-flex', sm: 'none' }, flex: 'none' }}>
          Filters{count ? ` · ${count}` : ''} {open ? '▴' : '▾'}
        </Button>
      </Stack>
      <Box sx={{ display: { xs: open ? 'contents' : 'none', sm: 'contents' } }}>
      <Field label="Category" value={filters.group} onChange={set('group')}>
        <MenuItem value="">All categories</MenuItem>
        <MenuItem value="none">Uncategorised</MenuItem>
        {tops.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
      </Field>
      <Field label="Account" value={filters.account} onChange={set('account')}>
        <MenuItem value="">All accounts</MenuItem>
        {accounts.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
      </Field>
      <Field label="Size" value={filters.min} onChange={(v) => set('min')(Number(v))} width={150}>
        {MIN_OPTIONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
      </Field>
      {hasCash && (
        <Box component="button" type="button" aria-pressed={filters.noCash} onClick={() => set('noCash')(!filters.noCash)}
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: CONTROL, px: 1.5, font: 'inherit', fontSize: 14, cursor: 'pointer', borderRadius: '8px', border: 1, borderColor: filters.noCash ? 'primary.main' : 'cockpit.line2', bgcolor: filters.noCash ? 'cockpit.hatch' : 'cockpit.panel', color: 'cockpit.tx' }}>
          {filters.noCash ? '✓ ' : ''}Without cash withdrawals
        </Box>
      )}
      </Box>
      {active ? <Button onClick={() => setFilters({ account: '', group: '', q: '', min: 0, noCash: false })}>Clear filters</Button> : null}
    </Box>
  );
}

// ---------- figures ----------

function Kpis({ total, prevTotal, avgTotal, debits, month, running, cats }) {
  const day = running ? new Date().getDate() : daysIn(month);
  const perDay = total / Math.max(day, 1);
  const vsAvg = pctChange(total, avgTotal);
  const ticket = debits.length ? debits.reduce((s, r) => s + num(r.amount), 0) / debits.length : 0;
  const movers = cats.filter((c) => c.delta != null);
  const up = movers.reduce((b, c) => (c.delta > (b?.delta ?? 0) ? c : b), null);
  const down = movers.reduce((b, c) => (c.delta < (b?.delta ?? 0) ? c : b), null);
  const largest = debits.reduce((b, r) => (num(r.amount) > num(b?.amount ?? 0) ? r : b), null);
  let spentNote = null, spentColor;
  if (vsAvg != null && !running) {
    spentNote = `${Math.abs(Math.round(vsAvg * 100))}% ${vsAvg <= 0 ? 'below' : 'above'} your ${AVERAGE_MONTHS}-month average (${euro(avgTotal)})`;
    spentColor = vsAvg <= 0 ? 'cockpit.pos' : 'cockpit.neg';
  } else if (avgTotal != null) spentNote = `An average month is ${euro(avgTotal)}`;
  return (
    <Box component="section" aria-label="This month in figures" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.5, md: 2 } }}>
      <Figure label={running ? 'Spent so far' : 'Spent'} value={euro(total)} note={spentNote} noteColor={spentColor} />
      <Figure label="Per day" value={euro(perDay)}
        note={running ? `On course for about ${euro(perDay * daysIn(month))}` : prevTotal != null ? `Last month ${euro(prevTotal / daysIn(addMonths(month, -1)))} a day` : `${day} days`} />
      <Figure label="Payments" value={String(debits.length)} note={debits.length ? `${euro(ticket)} on average · largest ${euro(largest?.amount)}${largest ? ` (${txnName(largest).name})` : ''}` : null} />
      <Figure label="Biggest change" value={up ? up.label : '—'} valueColor={up ? 'cockpit.neg' : undefined}
        note={[up && `+${euro(up.delta)} vs average`, down && down.delta < 0 && `${down.label} ${euro(down.delta)}`].filter(Boolean).join(' · ') || 'Nothing unusual'} />
    </Box>
  );
}

// ---------- category table ----------

function Spark({ values, color, highlight }) {
  const max = Math.max(...values, 1);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 18 }} aria-hidden>
      {values.map((v, i) => <Box key={i} sx={{ flex: '1 1 0', minHeight: 1, height: `${(Math.max(v, 0) / max) * 100}%`, bgcolor: i === highlight ? color : 'cockpit.line2', borderRadius: '1px' }} />)}
    </Box>
  );
}

function DeltaCell({ value, base }) {
  if (value == null) return <Box component="span" sx={{ color: 'cockpit.tx3' }}>—</Box>;
  const pct = base ? value / base : null;
  const color = Math.abs(value) < 1 ? 'cockpit.tx3' : value > 0 ? 'cockpit.neg' : 'cockpit.pos';
  return (
    <Box component="span" sx={{ color }} title={pct != null ? `${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%` : undefined}>
      {value > 0 ? '+' : ''}{amount(value)}
    </Box>
  );
}

function CategoryTable({ cats, total, prevTotal, avgTotal, winMonths, focus, onFocus }) {
  const [sort, setSort] = useState({ field: 'cur', order: 'DESC' });
  const [open, setOpen] = useState(() => new Set());
  const get = { label: (c) => c.label, share: (c) => c.cur, trend: (c) => c.spark.reduce((sum, v) => sum + v, 0) };
  const shown = sortRows(cats, sort, get);
  const highlight = winMonths.length - 1;
  if (!cats.length) return <Typography sx={{ color: 'cockpit.tx3', py: 4, textAlign: 'center' }}>No spending matches these filters.</Typography>;
  const head = (field, label, sx, first) => <SortTh field={field} first={first} sort={sort} onSort={setSort} sx={{ ...thSx, ...sx }}>{label}</SortTh>;
  const right = { textAlign: 'right' };
  const row = (c, { sub, top, color }) => {
    const isOpen = open.has(c.key);
    const focused = focus?.key === c.key;
    return (
      <Box component="tr" key={`${sub ? 's' : 't'}-${c.key}`} onClick={() => onFocus(c, !sub)} aria-selected={focused}
        sx={{ cursor: 'pointer', '& > td': { bgcolor: focused ? 'cockpit.hatch' : 'transparent' }, '&:hover > td': { bgcolor: 'cockpit.panel2' } }}>
        <Box component="td" sx={{ ...tdSx, pl: sub ? 5 : 0.5 }} title={c.label}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            {!sub && (c.subs.length ? (
              <IconButton size="small" aria-label={isOpen ? `Hide ${c.label} subcategories` : `Show ${c.label} subcategories`} aria-expanded={isOpen}
                onClick={(e) => { e.stopPropagation(); setOpen((s) => { const n = new Set(s); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; }); }}
                sx={{ p: '4px' }}>
                {isOpen ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            ) : <Box sx={{ width: 26, flex: 'none' }} />)}
            <Box sx={{ width: sub ? 7 : 9, height: sub ? 7 : 9, borderRadius: '50%', bgcolor: color, flex: 'none', opacity: sub ? 0.7 : 1 }} />
            <Box component="span" sx={{ fontWeight: sub ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: c.key === 'none' ? 'italic' : undefined, color: c.key === 'none' ? 'cockpit.warn' : undefined }}>{c.label}</Box>
          </Stack>
        </Box>
        <Box component="td" sx={{ ...tdSx, ...right, fontWeight: sub ? 400 : 600 }}>{amount(c.cur)}</Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowSm }}>
          <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'cockpit.panel2' }}><Box sx={{ height: 6, borderRadius: 3, width: `${Math.max(0, Math.min(1, c.share)) * 100}%`, bgcolor: color, opacity: sub ? 0.7 : 1 }} /></Box>
        </Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx3' }}>{total ? `${Math.round(c.share * 100)}%` : ''}</Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...right, color: 'cockpit.tx2' }}>{c.prev == null ? '—' : amount(c.prev)}</Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...right, color: 'cockpit.tx2' }}>{c.average == null ? '—' : amount(c.average)}</Box>
        <Box component="td" sx={{ ...tdSx, ...right }}><DeltaCell value={c.delta} base={c.average} /></Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx2' }}>{c.count || '—'}</Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx2' }}>{c.ticket == null ? '—' : amount(c.ticket)}</Box>
        <Box component="td" sx={{ ...tdSx, ...hideBelowMd }} title={winMonths.map((m, i) => `${formatShortMonth(m)} ${amount(c.spark[i])}`).join('\n')}><Spark values={c.spark} color={color} highlight={highlight} /></Box>
      </Box>
    );
  };
  return (
    <Box sx={{ mx: { xs: -1, md: -1.5 } }}>
      <Box component="table" sx={tableSx}>
        <thead><tr>
          {head('label', 'Category', { pl: 4.5 }, 'ASC')}
          {head('cur', 'Spent', { ...right, width: { xs: 92, sm: 104 } })}
          {head('share', 'Share', { ...hideBelowSm, width: '13%' })}
          {head('share', '%', { ...hideBelowMd, ...right, width: 64 })}
          {head('prev', 'Last month', { ...hideBelowSm, ...right, width: 112 })}
          {head('average', `${AVERAGE_MONTHS}-mo avg`, { ...hideBelowSm, ...right, width: 104 })}
          {head('delta', 'vs avg', { ...right, width: { xs: 84, sm: 96 } })}
          {head('count', 'Payments', { ...hideBelowMd, ...right, width: 96 })}
          {head('ticket', 'Avg payment', { ...hideBelowMd, ...right, width: 112 })}
          {head('trend', '12 months', { ...hideBelowMd, width: 120 })}
        </tr></thead>
        <tbody>
          {shown.map((c) => (
            <Fragment key={c.key}>
              {row(c, { color: c.color })}
              {open.has(c.key) && sortRows(c.subs, sort, get).map((s) => row(s, { sub: true, color: c.color }))}
            </Fragment>
          ))}
          <Box component="tr" sx={{ '& > td': { fontWeight: 600, borderBottom: 0 } }}>
            <Box component="td" sx={{ ...tdSx, pl: 4.5 }}>Total</Box>
            <Box component="td" sx={{ ...tdSx, ...right }}>{amount(total)}</Box>
            <Box component="td" sx={{ ...tdSx, ...hideBelowSm }} />
            <Box component="td" sx={{ ...tdSx, ...hideBelowMd }} />
            <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...right }}>{prevTotal == null ? '—' : amount(prevTotal)}</Box>
            <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...right }}>{avgTotal == null ? '—' : amount(avgTotal)}</Box>
            <Box component="td" sx={{ ...tdSx, ...right }}><DeltaCell value={avgTotal == null ? null : total - avgTotal} base={avgTotal} /></Box>
            <Box component="td" sx={{ ...tdSx, ...hideBelowMd }} />
            <Box component="td" sx={{ ...tdSx, ...hideBelowMd }} />
            <Box component="td" sx={{ ...tdSx, ...hideBelowMd }} />
          </Box>
        </tbody>
      </Box>
      <Typography sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 1.5, px: { xs: 1, md: 1.5 } }}>
        Click a row to see its merchants and payments below. Refunds and reimbursements count against the category they belong to.
      </Typography>
    </Box>
  );
}

// ---------- heatmap ----------

function Heatmap({ cats, totals, winMonths, month, known, onMonth }) {
  const theme = useTheme();
  const rows = [...cats].sort((a, b) => b.spark.reduce((s, v) => s + v, 0) - a.spark.reduce((s, v) => s + v, 0));
  const scroller = useRef(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth; }, [month]);
  const totalMax = Math.max(...winMonths.map((m) => totals[m] || 0), 1);
  const cell = (v, max, color, m, label) => {
    const level = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    const selected = m === month;
    return (
      <Box component="td" key={m} onClick={() => known.has(m) && onMonth(m)} title={`${label} · ${formatMonth(m)}: ${euro(v)}`}
        sx={{ p: '2px', cursor: known.has(m) ? 'pointer' : 'default' }}>
        <Box sx={{ height: 30, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
          bgcolor: v > 0 ? alpha(color, 0.12 + level * 0.78) : 'cockpit.panel2', color: level > 0.55 ? '#fff' : 'cockpit.tx2',
          outline: selected ? 2 : 0, outlineStyle: 'solid', outlineColor: theme.palette.text.primary, outlineOffset: -1 }}>
          {v > 0 ? axisAmount(v) : ''}
        </Box>
      </Box>
    );
  };
  return (
    <Box ref={scroller} sx={{ overflowX: 'auto', mx: { xs: -1, md: 0 } }}>
      <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 720, tableLayout: 'fixed' }}>
        <thead><tr>
          <Box component="th" sx={{ ...thSx, width: { xs: 110, md: 170 }, borderBottom: 0, position: 'sticky', left: 0, zIndex: 1 }} />
          {winMonths.map((m) => (
            <Box component="th" key={m} onClick={() => known.has(m) && onMonth(m)}
              sx={{ ...thSx, borderBottom: 0, px: 0, textAlign: 'center', fontSize: 12, cursor: known.has(m) ? 'pointer' : 'default', color: m === month ? 'cockpit.tx' : 'cockpit.tx3', fontWeight: m === month ? 600 : 500 }}>
              {formatShortMonth(m)}
            </Box>
          ))}
        </tr></thead>
        <tbody>
          <tr>
            <Box component="td" sx={{ fontSize: 13.5, fontWeight: 600, pr: 1, position: 'sticky', left: 0, bgcolor: 'cockpit.panel', zIndex: 1 }}>All</Box>
            {winMonths.map((m) => cell(totals[m] || 0, totalMax, theme.palette.primary.main, m, 'All'))}
          </tr>
          {rows.map((c) => {
            const max = Math.max(...c.spark, 1);
            return (
              <tr key={c.key}>
                <Box component="td" sx={{ fontSize: 13.5, pr: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'sticky', left: 0, bgcolor: 'cockpit.panel', zIndex: 1 }} title={c.label}>{c.label}</Box>
                {winMonths.map((m, i) => cell(c.spark[i], max, c.color, m, c.label))}
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

// ---------- merchants and payments ----------

function Details({ rows, prevRows, nameOf, topOf, colorOf, accountName }) {
  const [view, setView] = useState('merchants');
  const [msort, setMsort] = useState({ field: 'total', order: 'DESC' });
  const [tsort, setTsort] = useState({ field: 'spend', order: 'DESC' });
  const [limit, setLimit] = useState(PAGE);
  const merchantOf = (r) => txnName(r).name;

  const merchants = useMemo(() => {
    const prev = new Map();
    for (const r of prevRows) prev.set(merchantOf(r), (prev.get(merchantOf(r)) || 0) + spendOf(r));
    const by = new Map();
    for (const r of rows) {
      const key = merchantOf(r);
      const m = by.get(key) || { name: key, total: 0, count: 0, category_id: r.category_id };
      m.total += spendOf(r);
      if (r.direction !== 'credit') m.count += 1;
      by.set(key, m);
    }
    return [...by.values()].map((m) => ({ ...m, avg: m.count ? m.total / m.count : null, prev: prev.get(m.name) ?? null, category: nameOf(m.category_id ?? 'none') }));
  }, [rows, prevRows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return <Typography sx={{ color: 'cockpit.tx3', py: 4, textAlign: 'center' }}>Nothing here for this month.</Typography>;
  const tx = rows.map((r) => ({ ...r, spend: spendOf(r), name: merchantOf(r), categoryName: nameOf(r.category_id ?? 'none'), account: accountName(r.account_id) }));
  const right = { textAlign: 'right' };
  const max = Math.max(...merchants.map((m) => m.total), 1);

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}><Segments label="Show" value={view} onChange={(v) => { setView(v); setLimit(PAGE); }} options={[['merchants', `Merchants · ${merchants.length}`], ['payments', `Payments · ${rows.length}`]]} /></Box>
      <Box sx={{ mx: { xs: -1, md: -1.5 } }}>
        {view === 'merchants' ? (
          <Box component="table" sx={tableSx}>
            <thead><tr>
              <SortTh field="name" first="ASC" sort={msort} onSort={setMsort} sx={thSx}>Merchant</SortTh>
              <SortTh field="category" first="ASC" sort={msort} onSort={setMsort} sx={{ ...thSx, ...hideBelowSm, width: '22%' }}>Category</SortTh>
              <SortTh field="count" sort={msort} onSort={setMsort} sx={{ ...thSx, ...hideBelowMd, ...right, width: 96 }}>Payments</SortTh>
              <SortTh field="avg" sort={msort} onSort={setMsort} sx={{ ...thSx, ...hideBelowMd, ...right, width: 104 }}>Average</SortTh>
              <SortTh field="prev" sort={msort} onSort={setMsort} sx={{ ...thSx, ...hideBelowSm, ...right, width: 112 }}>Last month</SortTh>
              <SortTh field="total" sort={msort} onSort={setMsort} sx={{ ...thSx, ...right, width: { xs: 96, sm: 112 } }}>Total</SortTh>
            </tr></thead>
            <tbody>
              {sortRows(merchants, msort).slice(0, limit).map((m) => (
                <tr key={m.name}>
                  <Box component="td" sx={tdSx} title={m.name}>
                    <Box sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</Box>
                    <Box sx={{ height: 3, mt: '3px', borderRadius: 2, bgcolor: 'cockpit.panel2' }}><Box sx={{ height: 3, borderRadius: 2, width: `${Math.max(0, m.total / max) * 100}%`, bgcolor: colorOf(topOf(m.category_id)) }} /></Box>
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, color: 'cockpit.tx2' }}>{m.category}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx2' }}>{m.count}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx2' }}>{m.avg == null ? '—' : amount(m.avg)}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...right, color: 'cockpit.tx3' }}>{m.prev == null ? '—' : amount(m.prev)}</Box>
                  <Box component="td" sx={{ ...tdSx, ...right, fontWeight: 600 }}>{amount(m.total)}</Box>
                </tr>
              ))}
            </tbody>
          </Box>
        ) : (
          <Box component="table" sx={tableSx}>
            <thead><tr>
              <SortTh field="txn_date" sort={tsort} onSort={setTsort} sx={{ ...thSx, width: { xs: 64, sm: 80 } }}>Date</SortTh>
              <SortTh field="name" first="ASC" sort={tsort} onSort={setTsort} sx={thSx}>Merchant</SortTh>
              <SortTh field="categoryName" first="ASC" sort={tsort} onSort={setTsort} sx={{ ...thSx, ...hideBelowSm, width: '22%' }}>Category</SortTh>
              <SortTh field="account" first="ASC" sort={tsort} onSort={setTsort} sx={{ ...thSx, ...hideBelowMd, width: '18%' }}>Account</SortTh>
              <SortTh field="spend" sort={tsort} onSort={setTsort} sx={{ ...thSx, ...right, width: { xs: 96, sm: 112 } }}>Amount</SortTh>
            </tr></thead>
            <tbody>
              {sortRows(tx, tsort).slice(0, limit).map((r) => (
                <tr key={r.id}>
                  <Box component="td" sx={{ ...tdSx, color: 'cockpit.tx2' }}>{formatDayMonth(r.txn_date)}</Box>
                  <Box component="td" sx={tdSx} title={[r.name, r.note].filter(Boolean).join(' · ')}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{r.name}</Box>
                    {r.note && <Box component="span" sx={{ color: 'cockpit.tx3', ml: 1, display: { xs: 'none', sm: 'inline' } }}>{r.note}</Box>}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, color: 'cockpit.tx2' }}>{r.categoryName}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, color: 'cockpit.tx3' }}>{r.account}</Box>
                  <Box component="td" sx={{ ...tdSx, ...right, fontWeight: 600, color: r.spend < 0 ? 'cockpit.pos' : 'cockpit.tx' }}>{r.spend < 0 ? `+${amount(-r.spend)}` : amount(r.spend)}</Box>
                </tr>
              ))}
            </tbody>
          </Box>
        )}
      </Box>
      {(view === 'merchants' ? merchants.length : rows.length) > limit && (
        <Box sx={{ textAlign: 'center', pt: 1.5 }}><Button onClick={() => setLimit((n) => n + PAGE)}>Show more</Button></Box>
      )}
    </Box>
  );
}

