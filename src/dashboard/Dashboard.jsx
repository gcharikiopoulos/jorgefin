import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Skeleton, Stack, TextField, Typography, useTheme } from '@mui/material';
import { useDataProvider, Title } from 'react-admin';
import { useQueries, useQuery } from '@tanstack/react-query';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { GridLines, KpiTile, Label, Mono, Panel, QueryState, delta, niceTicks, signedPercent, tone } from './parts.jsx';
import { useCategories, useMonths } from '../hooks.js';
import { checkAccess, num } from '../backend.js';
import {
  REST_COLOR, amount, axisAmount, categoryColor, seriesColor, formatDayMonth, formatMonth, formatShortMonth, parseDate, percent, signedAmount, sourceShort, txnName,
} from '../format.js';
import { monoSx } from '../theme.js';
import { CategoryTag } from '../components/CategoryTag.jsx';
import { CONTROL, ROW } from '../components/dense.js';

const MAX_CATEGORIES = 10;
export const transactionsLink = (filter) => `/transactions?filter=${encodeURIComponent(JSON.stringify(filter))}`;
const daysIn = (month) => { const d = parseDate(month); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
export const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const SOURCE_ORDER = ['card_alert', 'account_alert', 'statement_csv', 'manual', 'mock'];

// ---------- shared queries ----------

export function useBreakdown(month) {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['breakdown', month], queryFn: () => dataProvider.getCategoryBreakdown(month, 'expense'), enabled: !!month });
}
function useDaily(month) {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['daily', month], queryFn: () => dataProvider.getDailySpend(month), enabled: !!month });
}
export function useBalance() {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['balance-history'], queryFn: () => dataProvider.getBalanceHistory() });
}
export function useMonthTransactions(month) {
  const dataProvider = useDataProvider();
  return useQuery({
    queryKey: ['month-transactions', month],
    enabled: !!month,
    queryFn: async () => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'txn_date', order: 'DESC' }, filter: { month } })).data,
  });
}

// Subcategories roll up into their parent, which carries the colour: Map(topId -> { category_id, label, total, rowColor }).
export function rollup(rows = [], categories) {
  const groups = new Map();
  for (const r of rows) {
    const cat = categories.find((c) => c.id === r.category_id);
    const topId = cat ? (cat.parent_id ?? cat.id) : r.category_id ?? null;
    const top = categories.find((c) => c.id === topId);
    const g = groups.get(topId) || { category_id: topId, label: topId == null ? 'Uncategorised' : top?.name || r.parent_category || r.category || 'Unknown', total: 0, rowColor: r.color };
    g.total += num(r.total);
    groups.set(topId, g);
  }
  return groups;
}

// ---------- header ----------

function MonthPicker({ months, index, onChange }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'cockpit.line2', borderRadius: '3px', height: CONTROL, bgcolor: 'cockpit.panel' }}>
      <IconButton aria-label="Previous month" onClick={() => onChange(index + 1)} disabled={index >= months.length - 1} sx={{ borderRadius: 0, p: { xs: '10px', md: '5px' } }}><ChevronLeftIcon sx={{ fontSize: 20 }} /></IconButton>
      <TextField
        select
        variant="standard"
        value={months[index]?.month ?? ''}
        onChange={(e) => onChange(months.findIndex((m) => m.month === e.target.value))}
        slotProps={{ input: { disableUnderline: true }, htmlInput: { 'aria-label': 'Month' } }}
        sx={{ m: 0, minWidth: 150, alignSelf: 'stretch', height: '100%', '& .MuiInputBase-root': { height: '100%' }, '& .MuiSelect-select': { height: '100% !important', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }, '& .MuiSelect-select.MuiSelect-select': { ...monoSx, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', py: 0, pl: 0.5 } }}
      >
        {months.map((m) => <MenuItem key={m.month} value={m.month} sx={{ textTransform: 'capitalize' }}>{formatMonth(m.month)}</MenuItem>)}
      </TextField>
      <IconButton aria-label="Next month" onClick={() => onChange(index - 1)} disabled={index <= 0} sx={{ borderRadius: 0, p: { xs: '10px', md: '5px' } }}><ChevronRightIcon sx={{ fontSize: 20 }} /></IconButton>
    </Stack>
  );
}

// ---------- key figures ----------

function KpiRow({ months, index, txQuery }) {
  const navigate = useNavigate();
  const m = months[index];
  const prev = months[index + 1];
  const window = months.slice(index, index + 12).reverse();
  const series = (f) => window.map(f);
  const net = num(m.net);
  const income = num(m.income);
  const rate = (r) => (r.savings_rate != null ? num(r.savings_rate) : num(r.income) ? num(r.net) / num(r.income) : 0);
  const elapsed = (r) => (r.month === thisMonth() ? new Date().getDate() : daysIn(r.month));
  const perDay = (r) => num(r.expenses) / elapsed(r);
  const d = (cur, before) => delta(cur, before);
  const deltaText = (v) => (v == null ? null : `${v >= 0 ? '▲' : '▼'} ${signedPercent(v)}`);

  const uncat = num(m.uncategorized_count);
  const total = num(m.txn_count);
  const rows = txQuery.data || [];
  const uncatRows = rows.filter((r) => r.category_id == null);
  const uncatIn = uncatRows.filter((r) => r.direction === 'credit').length;
  const done = total ? (total - uncat) / total : 1;
  const rateDelta = prev ? rate(m) - rate(prev) : null;

  return (
    <Box component="section" aria-label="Key figures" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }, gap: '8px' }}>
      <KpiTile label="Income" value={amount(income)} unit="€" series={series((r) => num(r.income))} format={amount}
        deltaText={deltaText(d(income, prev && num(prev.income)))} deltaColor={tone(d(income, prev && num(prev.income)))} />
      <KpiTile label="Expenses" value={amount(m.expenses)} unit="€" series={series((r) => num(r.expenses))} format={amount}
        deltaText={deltaText(d(num(m.expenses), prev && num(prev.expenses)))} deltaColor={tone(d(num(m.expenses), prev && num(prev.expenses)), false)} />
      <KpiTile label="Net" value={signedAmount(net)} unit="€" valueColor={net >= 0 ? 'cockpit.pos' : 'cockpit.neg'} series={series((r) => num(r.net))} format={signedAmount}
        deltaText={deltaText(d(net, prev && num(prev.net)))} deltaColor={tone(d(net, prev && num(prev.net)))} />
      <KpiTile label="Savings rate" value={income ? percent(rate(m), 1).replace(/\s?%$/, '') : '—'} unit="%" series={series(rate)} format={(v) => percent(v, 1)}
        deltaText={rateDelta == null ? null : `${rateDelta >= 0 ? '▲ +' : '▼ −'}${(Math.abs(rateDelta) * 100).toFixed(1).replace('.', ',')}pp`} deltaColor={tone(rateDelta)} />
      <KpiTile label="Avg daily spend" value={amount(perDay(m))} unit="€/d" series={series(perDay)} format={amount}
        deltaText={deltaText(d(perDay(m), prev && perDay(prev)))} deltaColor={tone(d(perDay(m), prev && perDay(prev)), false)} />
      <KpiTile
        label="To review"
        value={uncat ? String(uncat) : 'All done'}
        valueColor={uncat ? 'cockpit.warn' : 'cockpit.pos'}
        onClick={uncat ? () => navigate('/review') : undefined}
        footer={(
          <>
            <Mono sx={{ fontSize: 11.5, color: 'cockpit.tx2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
              {uncat ? `${uncat - uncatIn} out · ${uncatIn} in · ${new Set(uncatRows.map((r) => r.description)).size} descriptions` : 'Every transaction has a category'}
            </Mono>
            <Box sx={{ display: 'flex', height: 4, width: '100%', bgcolor: 'cockpit.line', borderRadius: '1px', overflow: 'hidden' }}>
              <Box sx={{ width: `${done * 100}%`, bgcolor: 'cockpit.pos' }} />
              <Box sx={{ width: `${(1 - done) * 100}%`, bgcolor: 'cockpit.warn' }} />
            </Box>
            <Mono sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'cockpit.tx3', borderTop: 1, borderStyle: 'dashed', borderColor: 'cockpit.line', pt: 0.5 }}>
              <span>DONE {total - uncat}/{total} · {percent(done, 1)}</span>
              {uncat > 0 && <span>OPEN ▸</span>}
            </Mono>
          </>
        )}
      />
    </Box>
  );
}

// ---------- charts ----------

const svgBox = { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' };

// Two lines: day-to-day cash, and savings + investments (investments at cost).
export function BalanceChart({ month, legend = true }) {
  const c = useTheme().palette.cockpit;
  const query = useBalance();
  return (
    <QueryState query={query} height={180} empty="No balance on record yet.">
      {(rows) => {
        const upTo = rows.filter((r) => r.month <= month);
        const w = (upTo.length ? upTo : rows).slice(-12);
        const series = [
          { key: 'saved', label: 'SAVINGS & INV.', color: c.pos },
          { key: 'cash', label: 'CASH', color: c.acc },
        ].filter((s) => w.some((r) => r[s.key]));
        const vals = series.flatMap((s) => w.map((r) => r[s.key]));
        const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
        const step0 = niceTicks(max - min || 1, 4).ticks[1] || 1;
        const lo = min < 0 ? Math.floor(min / step0) * step0 : 0;
        const { ticks, top } = niceTicks(max - lo || 1, 4);
        const hi = lo + top;
        const n = Math.max(w.length - 1, 1);
        const X = (i) => (i / n) * 1000, Y = (v) => 6 + (1 - (v - lo) / (hi - lo || 1)) * 168;
        const line = (key) => 'M' + w.map((r, i) => `${X(i).toFixed(1)} ${Y(r[key]).toFixed(1)}`).join(' L');
        const last = w[w.length - 1];
        return (
          <Box sx={{ position: 'relative', height: 180, m: '12px 54px 24px 12px' }}>
            <svg viewBox="0 0 1000 180" preserveAspectRatio="none" style={svgBox} aria-hidden>
              <path d={ticks.map((t) => `M0 ${Y(lo + t).toFixed(1)} H1000`).join(' ')} stroke={c.line} fill="none" vectorEffect="non-scaling-stroke" />
              {series.map((s) => <path key={s.key} d={line(s.key)} stroke={s.color} strokeWidth={1.75} fill="none" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {ticks.map((t) => <Mono key={t} sx={{ position: 'absolute', right: -50, top: `${(Y(lo + t) / 180) * 100}%`, transform: 'translateY(-50%)', fontSize: 11, color: 'cockpit.tx3' }}>{axisAmount(lo + t)}</Mono>)}
            {w.map((r, i) => (
              <Box key={r.month}>
                {series.map((s) => (
                  <Box key={s.key} title={`${formatMonth(r.month)} · cash ${amount(r.cash)} € · savings & investments ${amount(r.saved)} € · total ${amount(r.balance)} €`}
                    sx={{ position: 'absolute', left: `${X(i) / 10}%`, top: `${(Y(r[s.key]) / 180) * 100}%`, width: 5, height: 5, m: '-3px 0 0 -3px', borderRadius: '50%', bgcolor: 'cockpit.panel', border: 1, borderColor: s.color }} />
                ))}
                <Mono sx={{ position: 'absolute', left: `${X(i) / 10}%`, bottom: -18, transform: 'translateX(-50%)', fontSize: 10.5, color: i === w.length - 1 ? 'cockpit.tx' : 'cockpit.tx3', whiteSpace: 'nowrap' }}>{formatShortMonth(r.month)}</Mono>
              </Box>
            ))}
            {legend && (
            <Mono component="div" sx={{ position: 'absolute', left: 4, top: 0, display: 'flex', flexDirection: 'column', gap: '1px', fontSize: 11, bgcolor: 'cockpit.panel', px: 0.5, py: '2px', border: 1, borderColor: 'cockpit.line', '& i': { display: 'inline-block', width: 10, height: 2, verticalAlign: 'middle', mr: 0.5 } }}>
              {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label} <b>{amount(last[s.key])}</b></span>)}
              <Box component="span" sx={{ color: 'cockpit.tx2' }}>TOTAL {amount(last.balance)}</Box>
            </Mono>
            )}
          </Box>
        );
      }}
    </QueryState>
  );
}

function cumulative(rows, month, upToDay) {
  const days = daysIn(month);
  const byDay = new Map((rows || []).map((r) => [parseDate(r.txn_date).getDate(), num(r.spend)]));
  let s = 0;
  return Array.from({ length: Math.min(days, upToDay ?? days) }, (_, i) => (s += byDay.get(i + 1) ?? 0));
}

function SpendPace({ months, index }) {
  const c = useTheme().palette.cockpit;
  const month = months[index].month;
  const prevMonth = months[index + 1]?.month;
  const cur = useDaily(month);
  const before = useDaily(prevMonth);
  const isCurrent = month === thisMonth();
  const today = isCurrent ? new Date().getDate() : null;
  const baseline = avg(months.slice(index + 1, index + 13).map((r) => num(r.expenses)));
  return (
    <QueryState query={cur} height={180} empty="No spending this month.">
      {(rows) => {
        const a = cumulative(rows, month, today);
        const b = before.data ? cumulative(before.data, prevMonth) : [];
        const days = daysIn(month);
        const now = a[a.length - 1] ?? 0;
        const projected = isCurrent && today < days ? (now / today) * days : null;
        const { ticks, top } = niceTicks(Math.max(now, projected ?? 0, b[b.length - 1] ?? 0, baseline) * 1.05, 4);
        const X = (i) => (i / 30) * 1000, Y = (v) => 180 - (v / top) * 174;
        const path = (arr) => (arr.length ? 'M' + arr.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' L') : '');
        const at = (arr, i) => arr[Math.min(i, arr.length) - 1];
        const comparable = b.length ? at(b, a.length) : null;
        return (
          <Box sx={{ position: 'relative', height: 180, m: '12px 54px 24px 12px' }}>
            <svg viewBox="0 0 1000 180" preserveAspectRatio="none" style={svgBox} aria-hidden>
              <path d={ticks.map((t) => `M0 ${Y(t).toFixed(1)} H1000`).join(' ')} stroke={c.line} fill="none" vectorEffect="non-scaling-stroke" />
              {baseline > 0 && <path d={`M0 180 L${X(days - 1)} ${Y(baseline)}`} stroke={c.tx3} strokeDasharray="1 3" fill="none" vectorEffect="non-scaling-stroke" />}
              {b.length > 0 && <path d={path(b)} stroke={c.out} strokeWidth={1.25} strokeDasharray="4 3" fill="none" vectorEffect="non-scaling-stroke" />}
              {projected && <path d={`M${X(a.length - 1)} ${Y(now)} L${X(days - 1)} ${Y(projected)}`} stroke={c.acc} strokeDasharray="2 3" fill="none" vectorEffect="non-scaling-stroke" />}
              <path d={path(a)} stroke={c.acc} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
            {ticks.map((t) => <Mono key={t} sx={{ position: 'absolute', right: -50, top: `${(Y(t) / 180) * 100}%`, transform: 'translateY(-50%)', fontSize: 11, color: 'cockpit.tx3' }}>{axisAmount(t)}</Mono>)}
            {[1, 8, 15, 22, days].map((d) => <Mono key={d} sx={{ position: 'absolute', left: `${X(d - 1) / 10}%`, bottom: -18, transform: 'translateX(-50%)', fontSize: 10.5, color: 'cockpit.tx3' }}>{String(d).padStart(2, '0')}</Mono>)}
            <Mono component="div" sx={{ position: 'absolute', left: 4, top: 0, display: 'flex', flexDirection: 'column', gap: '1px', fontSize: 11, bgcolor: 'cockpit.panel', px: 0.5, py: '2px', border: 1, borderColor: 'cockpit.line', '& i': { display: 'inline-block', width: 10, verticalAlign: 'middle', mr: 0.5 } }}>
              <span><i style={{ height: 2, background: c.acc }} />{formatShortMonth(month).toUpperCase()} <b>{amount(now)}</b>{projected ? ` → ${amount(projected)}` : ''}</span>
              {b.length > 0 && <Box component="span" sx={{ color: 'cockpit.tx2' }}><i style={{ borderTop: `1px dashed ${c.out}` }} />{formatShortMonth(prevMonth).toUpperCase()} {amount(b[b.length - 1])}{comparable != null && isCurrent ? ` (${amount(comparable)} by day ${a.length})` : ''}</Box>}
              {baseline > 0 && <Box component="span" sx={{ color: 'cockpit.tx3' }}><i style={{ borderTop: `1px dotted ${c.tx3}` }} />12M AVG {amount(baseline)}</Box>}
            </Mono>
          </Box>
        );
      }}
    </QueryState>
  );
}

function MonthLedger({ months, index, txQuery }) {
  const balance = useBalance();
  const m = months[index];
  const prev = months[index + 1];
  const rows = txQuery.data || [];
  const byMonth = new Map((balance.data || []).map((r) => [r.month, r]));
  const close = byMonth.get(m.month);
  const open = prev ? byMonth.get(prev.month) : null;
  const largest = rows.reduce((best, r) => (num(r.expense_amount) > num(best?.expense_amount) ? r : best), null);
  const cards = rows.filter((r) => r.txn_type === 'card_purchase' || r.txn_type === 'card').length;
  const credits = rows.filter((r) => r.direction === 'credit').length;
  const sources = SOURCE_ORDER.map((s) => ({ s, n: rows.filter((r) => r.source === s).length })).filter((x) => x.n);
  const shades = ['primary.main', 'cockpit.tx2', 'cockpit.line2', 'cockpit.out', 'cockpit.tx3'];
  const items = [
    ['Open', open ? formatDayMonth(open.day) : '—', open ? amount(open.balance) : '—'],
    ['In', `${credits} txn`, signedAmount(m.income), 'cockpit.pos'],
    ['Out', `${num(m.txn_count) - credits} txn`, signedAmount(-num(m.expenses))],
    ['Xfer out', 'transfers', signedAmount(-num(m.transfers_out)), 'cockpit.tx2'],
    ['Close', close ? formatDayMonth(close.day) : '—', close ? amount(close.balance) : '—', 'cockpit.tx', 700],
    ['Largest', largest ? txnName(largest).name : '—', largest ? amount(largest.expense_amount) : '—', 'cockpit.tx2'],
    ['Cards', 'card purchases', String(cards), 'cockpit.tx2'],
    ['Avg txn', 'per payment out', amount(num(m.expenses) / Math.max(num(m.txn_count) - credits, 1)), 'cockpit.tx2'],
  ];
  return (
    <>
      <Mono component="dl" sx={{ m: 0, px: 1.5, pt: 0.5, pb: 1, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 1, fontSize: 12.5, '& > *': { lineHeight: '26px', borderBottom: 1, borderColor: 'cockpit.line', m: 0 } }}>
        {items.map(([k, note, v, color, weight]) => [
          <Box component="dt" key={`${k}-k`} sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: weight ? 'cockpit.tx' : 'cockpit.tx3' }}>{k}</Box>,
          <Box component="dd" key={`${k}-n`} sx={{ fontSize: 11, color: 'cockpit.tx3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</Box>,
          <Box component="dd" key={`${k}-v`} sx={{ textAlign: 'right', color, fontWeight: weight }}>{v}</Box>,
        ])}
      </Mono>
      {sources.length > 0 && (
        <Box sx={{ px: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', height: 5, gap: '1px' }}>
            {sources.map((x, i) => <Box key={x.s} sx={{ flex: `${x.n} 1 0`, bgcolor: shades[i] }} />)}
          </Box>
          <Mono sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'cockpit.tx3' }}>
            {sources.map((x, i) => <span key={x.s}><Box component="span" sx={{ color: shades[i] }}>■</Box> {sourceShort(x.s)} {x.n}</span>)}
          </Mono>
        </Box>
      )}
    </>
  );
}

function CashFlow({ months, index, onPick }) {
  const c = useTheme().palette.cockpit;
  const [hover, setHover] = useState(null);
  const start = Math.max(0, index - 11);
  const window = months.slice(start, start + 12).reverse();
  const { ticks, top } = niceTicks(Math.max(...window.map((r) => Math.max(num(r.income), num(r.expenses)))), 4);
  const shown = months[hover ?? index];
  const shownNet = num(shown.net);
  const rate = num(shown.income) ? shownNet / num(shown.income) : null;
  return (
    <>
      <Mono component="div" sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minHeight: 32, flexWrap: 'wrap', px: 1.5, bgcolor: 'cockpit.panel2', borderBottom: 1, borderColor: 'cockpit.line', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', '& b': { color: 'cockpit.tx' }, color: 'cockpit.tx3' }}>
        <Box component="span" sx={{ fontWeight: 700, color: 'cockpit.accText', textTransform: 'uppercase' }}>▸ {formatShortMonth(shown.month)}</Box>
        <span>IN <b>{amount(shown.income)}</b></span>
        <span>OUT <b>{amount(shown.expenses)}</b></span>
        <span>NET <Box component="b" sx={{ color: shownNet >= 0 ? 'cockpit.pos !important' : 'cockpit.neg !important' }}>{signedAmount(shownNet)}</Box></span>
        {rate != null && <span>SAV <b>{percent(rate, 1)}</b></span>}
      </Mono>
      <Box sx={{ position: 'relative', height: 160, m: '10px 44px 0 12px' }}>
        <GridLines ticks={ticks} max={top} format={axisAmount} />
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', gap: '4px', alignItems: 'flex-end' }} onMouseLeave={() => setHover(null)}>
          {window.map((r) => {
            const i = months.indexOf(r);
            const net = num(r.net);
            return (
              <Box
                key={r.month}
                component="button"
                type="button"
                aria-label={`${formatMonth(r.month)}: in ${amount(r.income)}, out ${amount(r.expenses)}`}
                aria-pressed={i === index}
                onClick={() => onPick(i)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                sx={{ flex: '1 1 0', height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', p: 0, border: 0, cursor: 'pointer', bgcolor: i === index ? 'cockpit.hatch' : 'transparent', outline: i === index ? `1px solid ${c.acc}` : 'none', '&:hover': { bgcolor: 'cockpit.hatch' } }}
              >
                <Box component="span" sx={{ width: '38%', height: `${(num(r.income) / top) * 100}%`, bgcolor: 'primary.main', borderRadius: '1px 1px 0 0' }} />
                <Box component="span" sx={{ width: '38%', height: `${(num(r.expenses) / top) * 100}%`, bgcolor: 'cockpit.out', borderRadius: '1px 1px 0 0' }} />
                {net > 0 && <Box component="span" sx={{ position: 'absolute', left: '10%', right: '10%', height: 2, bottom: `${(net / top) * 100}%`, bgcolor: 'cockpit.pos' }} />}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: '4px', m: '4px 44px 10px 12px' }}>
        {window.map((r) => (
          <Mono key={r.month} sx={{ flex: '1 1 0', textAlign: 'center', fontSize: 10.5, color: months.indexOf(r) === index ? 'cockpit.accText' : 'cockpit.tx3', fontWeight: months.indexOf(r) === index ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden' }}>{formatShortMonth(r.month)}</Mono>
        ))}
      </Box>
    </>
  );
}

// Running income and expenses through one calendar year: two lines from 0 on
// 1 January, the gap between them shaded as savings (or overspend where expenses
// lead). Points sit at each month end; the x-axis always spans the whole year.
const MONTH_INITIALS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('el-GR', { month: 'short' }).format(new Date(2021, i, 1)).replace('.', '').toUpperCase());

function yearSeries(months, year) {
  const byMonth = new Map(months.filter((r) => r.month.startsWith(`${year}-`)).map((r) => [Number(r.month.slice(5, 7)) - 1, r]));
  const last = Math.max(-1, ...byMonth.keys());
  // Lines start where the data does (a year imported from November starts there,
  // not as a flat zero from January).
  const first = byMonth.size ? Math.min(...byMonth.keys()) : 0;
  const income = [0], expenses = [0];
  for (let i = 0; i <= last; i++) {
    const r = byMonth.get(i);
    income.push(income[i] + (r ? num(r.income) : 0));
    expenses.push(expenses[i] + (r ? num(r.expenses) : 0));
  }
  return { income, expenses, first, last };
}

// Shaded gap between two series (in data units), split where they cross so each
// piece has one sign: true where a (income) is ahead.
function gapPieces(xs, a, b) {
  const pieces = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const d0 = a[i] - b[i], d1 = a[i + 1] - b[i + 1];
    const seg = (x0, a0, b0, x1, a1, b1, sign) => pieces.push({ sign, pts: [[x0, a0], [x1, a1], [x1, b1], [x0, b0]] });
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      const xm = xs[i] + t * (xs[i + 1] - xs[i]), ym = a[i] + t * (a[i + 1] - a[i]);
      seg(xs[i], a[i], b[i], xm, ym, ym, d0 > 0);
      seg(xm, ym, ym, xs[i + 1], a[i + 1], b[i + 1], d1 > 0);
    } else seg(xs[i], a[i], b[i], xs[i + 1], a[i + 1], b[i + 1], d0 + d1 >= 0);
  }
  return pieces;
}

function YearToDate({ months, index }) {
  const theme = useTheme();
  const c = theme.palette.cockpit;
  const mode = theme.palette.mode;
  const years = [...new Set(months.map((r) => r.month.slice(0, 4)))].sort().reverse();
  const [year, setYear] = useState(null);
  const shownYear = year ?? months[index].month.slice(0, 4);
  const [hover, setHover] = useState(null);
  const { income, expenses, first, last } = yearSeries(months, shownYear);
  const incColor = seriesColor(0, mode), expColor = seriesColor(1, mode);
  const { ticks, top } = niceTicks(Math.max(...income, ...expenses, 1), 4);
  const X = (i) => (i / 12) * 1000, Y = (v) => 200 - (v / top) * 192;
  const idx = income.map((_, i) => i).slice(first);
  const path = (arr) => 'M' + idx.map((i) => `${X(i).toFixed(1)} ${Y(arr[i]).toFixed(1)}`).join(' L');
  const pieces = gapPieces(idx.map(X), idx.map((i) => income[i]), idx.map((i) => expenses[i]));
  const at = hover ?? last + 1; // point index: 1 = end of January
  const inc = income[at] ?? 0, exp = expenses[at] ?? 0, saved = inc - exp;
  const pct = (v) => `${(v / 200) * 100}%`;
  if (last < 0) return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No data for {shownYear}.</Typography>;
  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 34, px: 1.5, py: 0.5, bgcolor: 'cockpit.panel2', borderBottom: 1, borderColor: 'cockpit.line' }}>
        <Mono sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', fontSize: 12, color: 'cockpit.tx3', '& b': { color: 'cockpit.tx', fontWeight: 600 } }}>
          <Box component="span" sx={{ fontWeight: 700, color: 'cockpit.accText' }}>▸ {at === 0 ? `1 ${MONTH_INITIALS[0]}` : `${MONTH_INITIALS[at - 1]} ${shownYear}`}</Box>
          <span>IN <b>{amount(inc)}</b></span>
          <span>OUT <b>{amount(exp)}</b></span>
          <span>SAVED <Box component="b" sx={{ color: saved >= 0 ? 'cockpit.pos !important' : 'cockpit.neg !important' }}>{signedAmount(saved)}</Box></span>
          {inc > 0 && <span>RATE <b>{percent(saved / inc, 1)}</b></span>}
        </Mono>
        <Box sx={{ flexGrow: 1 }} />
        {years.length > 1 && (
          <Stack direction="row" role="group" aria-label="Year" sx={{ gap: 0.5 }}>
            {years.slice(0, 4).map((y) => (
              <Box key={y} component="button" type="button" aria-pressed={y === shownYear} onClick={() => { setYear(y); setHover(null); }}
                sx={{ ...monoSx, minHeight: { xs: 40, md: 26 }, px: 1.25, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: '3px', border: 1, borderColor: y === shownYear ? 'primary.main' : 'cockpit.line2', bgcolor: y === shownYear ? 'primary.main' : 'transparent', color: y === shownYear ? '#fff' : 'cockpit.tx2' }}>
                {y}
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
      <Box sx={{ position: 'relative', height: { xs: 200, md: 230 }, m: '14px 60px 26px 12px' }} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" style={svgBox} aria-hidden>
          <path d={ticks.map((t) => `M0 ${Y(t).toFixed(1)} H1000`).join(' ')} stroke={c.line} fill="none" vectorEffect="non-scaling-stroke" />
          {pieces.map((p, i) => <path key={i} d={'M' + p.pts.map(([x, v]) => `${x.toFixed(1)} ${Y(v).toFixed(1)}`).join(' L') + ' Z'} fill={p.sign ? c.pos : c.neg} opacity={0.14} />)}
          {hover != null && <path d={`M${X(hover)} 0 V200`} stroke={c.tx3} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
          <path d={path(expenses)} stroke={expColor} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <path d={path(income)} stroke={incColor} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {ticks.map((t) => <Mono key={t} sx={{ position: 'absolute', right: -54, top: pct(Y(t)), transform: 'translateY(-50%)', fontSize: 11, color: 'cockpit.tx3' }}>{axisAmount(t)}</Mono>)}
        {MONTH_INITIALS.map((m, i) => (
          <Mono key={m} sx={{ position: 'absolute', left: `${(X(i + 1) / 10)}%`, bottom: -22, transform: 'translateX(-50%)', fontSize: 10.5, color: i >= first && i <= last ? (i + 1 === at ? 'cockpit.tx' : 'cockpit.tx3') : 'cockpit.line2', fontWeight: i + 1 === at ? 700 : 400, display: { xs: i % 3 === 2 ? 'block' : 'none', sm: 'block' } }}>{m}</Mono>
        ))}
        {/* Markers on the readout point, with a 2px surface ring. */}
        {[[income, incColor], [expenses, expColor]].map(([arr, col]) => (
          <Box key={col} sx={{ position: 'absolute', left: `${X(at) / 10}%`, top: pct(Y(arr[at])), width: 9, height: 9, m: '-4.5px 0 0 -4.5px', borderRadius: '50%', bgcolor: col, boxShadow: `0 0 0 2px ${c.panel}`, pointerEvents: 'none' }} />
        ))}
        {/* Direct labels at the ends of the lines. */}
        {[[income, incColor, 'IN'], [expenses, expColor, 'OUT']].map(([arr, col, label]) => {
          const other = arr === income ? expenses : income;
          const above = arr[last + 1] >= other[last + 1];
          return (
            <Mono key={label} sx={{ position: 'absolute', left: `${X(last + 1) / 10}%`, top: pct(Y(arr[last + 1])), transform: `translate(${last + 1 >= 10 ? 'calc(-100% - 10px)' : '8px'}, ${above ? '-120%' : '20%'})`, fontSize: 11, fontWeight: 600, color: 'cockpit.tx', whiteSpace: 'nowrap', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box component="span" sx={{ width: 10, height: 2, bgcolor: col }} />{label} {amount(arr[last + 1])}
            </Mono>
          );
        })}
        {/* Hover targets: one column per month end, wider than the marks. */}
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {MONTH_INITIALS.map((m, i) => (
            <Box key={m} title={i >= first && i <= last ? `${MONTH_INITIALS[i]} ${shownYear}: in ${amount(income[i + 1])} · out ${amount(expenses[i + 1])}` : undefined}
              onMouseEnter={() => i >= first && i <= last && setHover(i + 1)} onClick={() => i >= first && i <= last && setHover(i + 1)}
              sx={{ flex: '1 1 0', cursor: i >= first && i <= last ? 'crosshair' : 'default' }} />
          ))}
        </Box>
      </Box>
    </>
  );
}

function CategoryTable({ months, index }) {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const { data: categories = [] } = useCategories();
  const month = months[index].month;
  const past = months.slice(index, index + 6).map((m) => m.month); // newest first
  const results = useQueries({ queries: past.map((mm) => ({ queryKey: ['breakdown', mm], queryFn: () => dataProvider.getCategoryBreakdown(mm, 'expense') })) });
  const cur = results[0];
  return (
    <QueryState query={cur} height={200} empty="No spending this month.">
      {(rows) => {
        const groups = past.map((_, i) => rollup(results[i]?.data, categories));
        const now = [...groups[0].values()].sort((a, b) => b.total - a.total);
        const total = now.reduce((s, g) => s + g.total, 0);
        const top = now.slice(0, MAX_CATEGORIES - 1);
        const rest = now.slice(MAX_CATEGORIES - 1);
        const lines = top.map((g) => {
          const hist = groups.map((gm) => gm.get(g.category_id)?.total ?? 0).reverse();
          return { ...g, hist, color: g.category_id == null ? theme.palette.cockpit.warn : categoryColor(g.category_id, categories, theme.palette.mode, g.rowColor) };
        });
        if (rest.length) lines.push({ category_id: 'other', label: `Other (${rest.length})`, total: rest.reduce((s, g) => s + g.total, 0), hist: [], color: REST_COLOR });
        const max = Math.max(...lines.map((l) => l.total));
        const head = { ...monoSx, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'cockpit.tx3', textAlign: 'left', px: 1.25, height: 32, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap' };
        const cell = { px: 1.25, height: ROW, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 };
        return (
          <>
            <Box sx={{ display: 'flex', height: 8, gap: '1px', m: '10px 12px 6px' }}>
              {lines.map((l) => <Box key={l.category_id ?? 'none'} title={`${l.label} · ${amount(l.total)} €`} sx={{ flex: `${l.total} 1 0`, bgcolor: l.color }} />)}
            </Box>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', ...monoSx, fontSize: 12.5, '& tbody tr:hover td': { bgcolor: 'cockpit.panel2' } }}>
              <thead>
                <tr>
                  <Box component="th" sx={{ ...head, width: { xs: 'auto', sm: '26%' } }}>Category</Box>
                  <Box component="th" sx={{ ...head, display: { xs: 'none', sm: 'table-cell' } }}>Share</Box>
                  <Box component="th" sx={{ ...head, width: { xs: 76, sm: '14%' }, textAlign: 'right' }}>Amount</Box>
                  <Box component="th" sx={{ ...head, width: '8%', textAlign: 'right', display: { xs: 'none', sm: 'table-cell' } }}>%</Box>
                  <Box component="th" sx={{ ...head, width: '11%', display: { xs: 'none', sm: 'table-cell' } }}>6 mo</Box>
                  <Box component="th" sx={{ ...head, width: { xs: 64, sm: '10%' }, textAlign: 'right' }}>vs prev</Box>
                  <Box component="th" sx={{ ...head, width: '10%', textAlign: 'right', display: { xs: 'none', sm: 'table-cell' } }}>vs 6M</Box>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const unc = l.category_id == null;
                  const prev = l.hist.length > 1 ? l.hist[l.hist.length - 2] : null;
                  const dPrev = prev ? (l.total - prev) / prev : null;
                  const mean = l.hist.length ? avg(l.hist) : null;
                  const dAvg = mean ? (l.total - mean) / mean : null;
                  const hMax = Math.max(...l.hist, 1);
                  return (
                    <tr key={l.category_id ?? 'none'}>
                      <Box component="td" sx={{ ...cell, fontFamily: theme.typography.fontFamily, fontSize: 13.5, color: unc ? 'cockpit.warn' : undefined, fontStyle: unc ? 'italic' : undefined }} title={l.label}>
                        <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '1px', mr: 0.875, bgcolor: l.color }} />{l.label}
                      </Box>
                      <Box component="td" sx={{ ...cell, display: { xs: 'none', sm: 'table-cell' } }}><Box sx={{ height: 5, bgcolor: 'cockpit.line', borderRadius: '1px' }}><Box sx={{ height: 5, width: `${(l.total / max) * 100}%`, bgcolor: l.color, borderRadius: '1px' }} /></Box></Box>
                      <Box component="td" sx={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{amount(l.total)}</Box>
                      <Box component="td" sx={{ ...cell, textAlign: 'right', color: 'cockpit.tx2', display: { xs: 'none', sm: 'table-cell' } }}>{percent(total ? l.total / total : 0, 1)}</Box>
                      <Box component="td" sx={{ ...cell, display: { xs: 'none', sm: 'table-cell' } }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 14 }}>
                          {l.hist.map((v, i) => <Box key={i} sx={{ flex: '1 1 0', height: `${(v / hMax) * 100}%`, bgcolor: i === l.hist.length - 1 ? l.color : 'cockpit.line2' }} />)}
                        </Box>
                      </Box>
                      <Box component="td" sx={{ ...cell, textAlign: 'right', color: tone(dPrev, false) }}>{dPrev == null ? '—' : signedPercent(dPrev)}</Box>
                      <Box component="td" sx={{ ...cell, textAlign: 'right', color: tone(dAvg, false), display: { xs: 'none', sm: 'table-cell' } }}>{dAvg == null ? '—' : signedPercent(dAvg)}</Box>
                    </tr>
                  );
                })}
              </tbody>
            </Box>
          </>
        );
      }}
    </QueryState>
  );
}

function dailyValues(rows, month) {
  const byDay = new Map((rows || []).map((r) => [parseDate(r.txn_date).getDate(), num(r.spend)]));
  return Array.from({ length: daysIn(month) }, (_, i) => byDay.get(i + 1) ?? 0);
}

function DailySpend({ month }) {
  const c = useTheme().palette.cockpit;
  const query = useDaily(month);
  const days = daysIn(month);
  const firstWeekday = parseDate(month).getDay();
  return (
    <QueryState query={query} height={140} empty="No spending this month.">
      {(rows) => {
        const values = dailyValues(rows, month);
        const sorted = [...values].sort((a, b) => b - a);
        // One outlier (rent day) would flatten every other bar: cap it and label it.
        const cap = sorted[0] > 2 * sorted[1] && sorted[1] > 0 ? sorted[1] * 1.15 : sorted[0];
        const { ticks, top } = niceTicks(cap, 3);
        const average = values.reduce((s, v) => s + v, 0) / days;
        return (
          <>
            <Box sx={{ position: 'relative', height: 140, m: '12px 44px 0 12px' }}>
              <GridLines ticks={ticks} max={top} format={axisAmount} />
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', gap: '3px', alignItems: 'flex-end' }}>
                {values.map((v, i) => {
                  const wd = (firstWeekday + i) % 7;
                  const weekend = wd === 0 || wd === 6;
                  const capped = v > top;
                  return (
                    <Box key={i} title={`${String(i + 1).padStart(2, '0')}.${month.slice(5, 7)} · ${amount(v)} €`} sx={{ flex: '1 1 0', height: '100%', display: 'flex', alignItems: 'flex-end', position: 'relative', bgcolor: weekend ? 'cockpit.hatch' : 'transparent' }}>
                      <Box sx={{ width: '100%', borderRadius: '1px 1px 0 0', height: capped ? '100%' : `${(v / top) * 100}%`, bgcolor: v ? 'primary.main' : 'transparent', borderBottom: v ? 0 : `2px solid ${c.line2}`, backgroundImage: capped ? 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,.3) 4px 6px)' : 'none' }} />
                      {capped && <Mono sx={{ position: 'absolute', top: 2, left: '50%', fontSize: 10.5, fontWeight: 700, color: '#fff', writingMode: 'vertical-rl', transform: 'translateX(-50%) rotate(180deg)' }}>{amount(v)}</Mono>}
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: `${Math.min(average / top, 1) * 100}%`, borderTop: 1, borderStyle: 'dashed', borderColor: 'cockpit.tx2' }}>
                <Mono sx={{ position: 'absolute', right: -40, top: -8, fontSize: 10.5, color: 'cockpit.tx2' }}>AVG</Mono>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: '3px', m: '4px 44px 10px 12px' }}>
              {values.map((_, i) => {
                const wd = (firstWeekday + i) % 7;
                const weekend = wd === 0 || wd === 6;
                const sparse = i % 7 !== 0 && i !== values.length - 1;
                return <Mono key={i} sx={{ flex: '1 1 0', textAlign: 'center', fontSize: 10.5, color: weekend ? 'cockpit.tx2' : 'cockpit.tx3', fontWeight: weekend ? 600 : 400, minWidth: 0, overflow: 'visible', whiteSpace: 'nowrap', visibility: { xs: sparse ? 'hidden' : 'visible', md: 'visible' } }}>{String(i + 1).padStart(2, '0')}</Mono>;
              })}
            </Box>
          </>
        );
      }}
    </QueryState>
  );
}

const thSx = { ...monoSx, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'cockpit.tx3', textAlign: 'left', px: 1.25, height: 32, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap' };
const tdSx = { px: 1.25, height: ROW, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 };
const tableSx = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', '& tbody tr:hover td': { bgcolor: 'cockpit.panel2' } };
const hideXs = { display: { xs: 'none', md: 'table-cell' } };

function TopMerchants({ query }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  return (
    <QueryState query={query} height={200} empty="No spending this month." isEmpty={(rows) => !rows.some((r) => num(r.expense_amount) > 0)}>
      {(rows) => {
        const totals = new Map();
        for (const r of rows) {
          const spend = num(r.expense_amount);
          if (!spend) continue;
          const key = r.merchant_name || r.description;
          const t = totals.get(key) || { name: key, total: 0, count: 0, category_id: r.category_id, category: r.category, color: r.color };
          t.total += spend;
          t.count += 1;
          totals.set(key, t);
        }
        const top = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 8);
        const max = top[0]?.total || 1;
        return (
          <Box component="table" sx={tableSx}>
            <thead><tr>
              <Box component="th" sx={{ ...thSx, width: 30 }}>#</Box>
              <Box component="th" sx={thSx}>Merchant</Box>
              <Box component="th" sx={{ ...thSx, width: 28, textAlign: 'right' }}>N</Box>
              <Box component="th" sx={{ ...thSx, width: 64, textAlign: 'right' }}>Avg</Box>
              <Box component="th" sx={{ ...thSx, width: 74, textAlign: 'right' }}>Total</Box>
            </tr></thead>
            <tbody>
              {top.map((t, i) => {
                const color = categoryColor(t.category_id, categories, theme.palette.mode, t.color);
                return (
                  <tr key={t.name}>
                    <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 11.5, color: 'cockpit.tx3' }}>{String(i + 1).padStart(2, '0')}</Box>
                    <Box component="td" sx={tdSx} title={t.name}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '1px', flex: 'none', bgcolor: color }} />
                        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</Box>
                        {t.category && <Mono sx={{ fontSize: 10.5, color: 'cockpit.tx3', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.category}</Mono>}
                      </Box>
                      <Box sx={{ height: 2, mt: '2px', bgcolor: 'cockpit.line' }}><Box sx={{ height: 2, width: `${(t.total / max) * 100}%`, bgcolor: color }} /></Box>
                    </Box>
                    <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 12, textAlign: 'right', color: 'cockpit.tx3' }}>{t.count}</Box>
                    <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 12, textAlign: 'right', color: 'cockpit.tx2' }}>{amount(t.total / t.count)}</Box>
                    <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{amount(t.total)}</Box>
                  </tr>
                );
              })}
            </tbody>
          </Box>
        );
      }}
    </QueryState>
  );
}

export function EmptyOrDenied() {
  const query = useQuery({ queryKey: ['access-check'], queryFn: checkAccess, staleTime: 0 });
  if (query.isPending) return <Skeleton variant="rectangular" height={200} sx={{ mt: 1 }} />;
  if (query.data === 'denied') return <Navigate to="/not-authorised" replace />;
  if (query.data === 'signed-out') return <Navigate to="/login" replace />;
  return <Typography sx={{ p: 4 }} color="text.secondary">No transactions yet.</Typography>;
}

const span = (md, lg) => ({ gridColumn: { xs: '1 / -1', md: `span ${md}`, lg: `span ${lg}` } });
const rowSx = { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(12, minmax(0, 1fr))' }, gap: '8px' };

// Number keys 1–9 jump to a panel (outside text fields).
function usePanelKeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      const el = /^[1-9]$/.test(e.key) && document.getElementById(`panel-${e.key}`);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// Every chart in one place, for one month: the Overview shows the essentials.
export function Reports() {
  const monthsQuery = useMonths();
  const [index, setIndex] = useState(0); // 0 = latest month with data, not the calendar month
  const months = monthsQuery.data || [];
  const month = months[index]?.month;
  const txQuery = useMonthTransactions(month);
  const dailyQuery = useDaily(month);
  const theme = useTheme();
  usePanelKeys();
  const daily = useMemo(() => {
    if (!dailyQuery.data || !month) return null;
    const values = dailyValues(dailyQuery.data, month);
    return { average: values.reduce((s, v) => s + v, 0) / values.length, peak: Math.max(...values), zero: values.filter((v) => v === 0).length };
  }, [dailyQuery.data, month]);

  if (monthsQuery.isPending) {
    return (
      <Box sx={{ pt: 0.75, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <Skeleton variant="rectangular" height={26} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(6, 1fr)' }, gap: '5px' }}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} variant="rectangular" height={78} />)}</Box>
        <Skeleton variant="rectangular" height={200} />
      </Box>
    );
  }
  if (monthsQuery.isError) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', mt: 1, border: 1, borderColor: 'cockpit.line', bgcolor: 'cockpit.panel' }} role="alert">
        <Typography color="error" sx={{ mb: 1.5 }}>{navigator.onLine ? 'Could not load your data.' : 'You are offline.'}</Typography>
        <Button variant="contained" onClick={() => monthsQuery.refetch()}>Retry</Button>
      </Box>
    );
  }
  if (!months.length) return <EmptyOrDenied />;

  const m = months[index];
  const days = daysIn(month);
  return (
    <Box sx={{ pb: 2, pt: 1.25, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Title title="Reports" />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="h1" sx={{ fontWeight: 700, fontSize: 14.5 }}>Reports</Typography>
        <Label sx={{ textTransform: 'none', letterSpacing: '0.02em' }}>{formatMonth(month)} · {num(m.txn_count)} transactions</Label>
        <Box sx={{ flexGrow: 1 }} />
        <MonthPicker months={months} index={index} onChange={setIndex} />
      </Stack>

      <KpiRow months={months} index={index} txQuery={txQuery} />

      <Panel id="panel-1" num={1} title="Year to date" meta="running income and expenses"
        right={<Label sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1.25, '& i': { display: 'inline-block', width: 12, height: 2, mr: 0.5, verticalAlign: 'middle' } }}>
          <span><Box component="i" sx={{ bgcolor: seriesColor(0, theme.palette.mode) }} />Income</span>
          <span><Box component="i" sx={{ bgcolor: seriesColor(1, theme.palette.mode) }} />Expenses</span>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}><Box component="i" sx={{ bgcolor: 'cockpit.pos', height: '8px !important', opacity: 0.4 }} />Saved</Box>
        </Label>}>
        <YearToDate months={months} index={index} />
      </Panel>

      <Box sx={rowSx}>
        <Panel id="panel-2" num={2} title="Balance" meta="end of month · investments at cost" sx={span(12, 5)}><BalanceChart month={month} /></Panel>
        <Panel id="panel-3" num={3} title="Spend pace" meta="cumulative" sx={span(7, 4)}><SpendPace months={months} index={index} /></Panel>
        <Panel id="panel-4" num={4} title="Month ledger" right={<Label>{month === thisMonth() ? `Day ${new Date().getDate()}/${days}` : `${days} days`}</Label>} sx={span(5, 3)}>
          <MonthLedger months={months} index={index} txQuery={txQuery} />
        </Panel>
      </Box>

      <Box sx={rowSx}>
        <Panel id="panel-5" num={5} title="Cash flow" meta="click a month"
          right={<Label sx={{ display: 'flex', gap: 1, '& i': { display: 'inline-block', width: 7, height: 7, mr: 0.5 } }}><span><Box component="i" sx={{ bgcolor: 'primary.main' }} />In</span><span><Box component="i" sx={{ bgcolor: 'cockpit.out' }} />Out</span><span><Box component="i" sx={{ bgcolor: 'cockpit.pos', height: '2px !important', verticalAlign: 'middle' }} />Net</span></Label>}
          sx={span(12, 5)}>
          <CashFlow months={months} index={index} onPick={setIndex} />
        </Panel>
        <Panel id="panel-6" num={6} title="Spending by category" right={<Mono sx={{ fontSize: 12.5, fontWeight: 600 }}>{amount(m.expenses)}</Mono>} sx={span(12, 7)}>
          <CategoryTable months={months} index={index} />
        </Panel>
      </Box>

      <Box sx={rowSx}>
        <Panel id="panel-7" num={7} title="Daily spending" sx={span(12, 7)}
          right={daily && <Mono sx={{ fontSize: 11.5, color: 'cockpit.tx3', display: { xs: 'none', sm: 'inline' }, '& b': { color: 'cockpit.tx' } }}>AVG <b>{amount(daily.average)}</b> · PEAK <b>{amount(daily.peak)}</b> · NO-SPEND <b>{daily.zero}d</b></Mono>}>
          <DailySpend month={month} />
        </Panel>
        <Panel id="panel-8" num={8} title="Top merchants" meta="by spend" sx={span(12, 5)}><TopMerchants query={txQuery} /></Panel>
      </Box>

    </Box>
  );
}
