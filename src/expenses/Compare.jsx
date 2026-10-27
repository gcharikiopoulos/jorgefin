// Expenses › Compare: two months face to face. Categories side by side with the
// difference, a bar that grows left for less spent and right for more, and a
// drill-down to subcategories, merchants and the payments of each month.
// The first side can also be the average of the six months before the second.
// The pair lives in the address (?compare=2026-09-01,2026-10-01), so a
// comparison can be bookmarked or linked from elsewhere.

import { Fragment, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Skeleton, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Title, useDataProvider } from 'react-admin';
import SwapIcon from '@mui/icons-material/SwapHoriz';
import { useCategories } from '../hooks.js';
import { num } from '../backend.js';
import { amount, categoryColor, formatDayMonth, formatMonth, formatShortMonth, txnName } from '../format.js';
import { transactionsLink } from '../dashboard/Dashboard.jsx';
import { PanelHeader, SplitLayout } from '../components/SidePanel.jsx';
import { Segments } from '../components/PrefixField.jsx';

export const AVG = 'avg6';
const AVG_MONTHS = 6;
const mono = { fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' };

export const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const spendOf = (r) => -num(r.signed_amount);
const signed = (v) => `${v > 0.004 ? '+' : v < -0.004 ? '−' : '±'}${amount(Math.abs(v))}`;
const pct = (d, base) => (base ? `${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d / base) * 100)}%` : '');
const tone = (d) => (Math.abs(d) < 1 ? 'cockpit.tx3' : d > 0 ? 'cockpit.neg' : 'cockpit.pos');

// Month view ↔ compare view, shown in the header of both.
export function ViewSwitch({ value, onChange }) {
  return (
    <Box role="tablist" aria-label="View" sx={{ display: 'flex', p: '3px', gap: '2px', bgcolor: 'cockpit.panel', borderRadius: '10px' }}>
      {[['month', 'Month'], ['compare', 'Compare']].map(([v, label]) => (
        <Box key={v} component="button" type="button" role="tab" aria-selected={value === v} onClick={() => value !== v && onChange(v)}
          sx={{ font: 'inherit', fontSize: 14, fontWeight: value === v ? 600 : 500, border: 0, cursor: 'pointer', borderRadius: '8px', px: 1.75, minHeight: { xs: 40, md: 36 },
            bgcolor: value === v ? 'cockpit.hatch' : 'transparent', color: value === v ? 'cockpit.accText' : 'cockpit.tx2' }}>
          {label}
        </Box>
      ))}
    </Box>
  );
}

// The rows of one side: one month, or the six months before `b` (divided later).
function useSide(spec, b, known) {
  const dataProvider = useDataProvider();
  const isAvg = spec === AVG;
  const from = isAvg ? addMonths(b, -AVG_MONTHS) : spec;
  const to = isAvg ? b : addMonths(spec, 1);
  const query = useQuery({ queryKey: ['expenses', from, to], queryFn: () => dataProvider.getExpenses(from, to) });
  const monthsIn = isAvg ? Array.from({ length: AVG_MONTHS }, (_, i) => addMonths(from, i)).filter((m) => known.has(m)) : [spec];
  return { ...query, divisor: isAvg ? Math.max(monthsIn.length, 1) : 1, monthsIn };
}

const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

function sideLabel(spec, side, short) {
  if (spec !== AVG) return cap(short ? formatShortMonth(spec) : formatMonth(spec));
  const n = side.monthsIn.length;
  return short ? `${n}-mo avg` : `Average of ${n} month${n === 1 ? '' : 's'}`;
}

// Categories (top-level, with subcategories), merchants and payments on both sides.
function useComparison({ rowsA, rowsB, divA }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  return useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const topOf = (id) => (id == null ? 'none' : byId.get(id)?.parent_id ?? id);
    const nameOf = (id) => (id === 'none' ? 'Uncategorised' : byId.get(id)?.name || 'Unknown');
    const node = (key, label) => ({ key, label, a: 0, b: 0, nA: 0, nB: 0 });
    const groups = new Map();
    const add = (r, side, div) => {
      const v = spendOf(r) / div;
      const top = topOf(r.category_id);
      const g = groups.get(top) || { ...node(top, nameOf(top)), subs: new Map(), merchants: new Map(), payA: [], payB: [] };
      const subKey = r.category_id ?? 'none';
      const sub = g.subs.get(subKey) || node(subKey, subKey === top ? `${nameOf(top)} (general)` : nameOf(subKey));
      const name = txnName(r).name;
      const m = g.merchants.get(name) || node(name, name);
      for (const n of [g, sub, m]) {
        n[side] += v;
        if (r.direction !== 'credit') n[side === 'a' ? 'nA' : 'nB'] += 1 / div;
      }
      (side === 'a' ? g.payA : g.payB).push(r);
      g.subs.set(subKey, sub);
      g.merchants.set(name, m);
      groups.set(top, g);
    };
    for (const r of rowsA) add(r, 'a', divA);
    for (const r of rowsB) add(r, 'b', 1);
    const cats = [...groups.values()].map((g) => ({
      ...g,
      diff: g.b - g.a,
      color: g.key === 'none' ? theme.palette.cockpit.warn : categoryColor(g.key, categories, theme.palette.mode),
      subs: [...g.subs.values()].map((s) => ({ ...s, diff: s.b - s.a })),
      merchants: [...g.merchants.values()].map((m) => ({ ...m, diff: m.b - m.a })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)),
      payA: g.payA.sort((x, y) => (x.txn_date < y.txn_date ? 1 : -1)),
      payB: g.payB.sort((x, y) => (x.txn_date < y.txn_date ? 1 : -1)),
    })).filter((c) => Math.abs(c.a) >= 0.005 || Math.abs(c.b) >= 0.005);
    return cats;
  }, [rowsA, rowsB, divA, categories, theme]);
}

// "Mostly Clothes (+245,32) and Leisure (+180,00); Cash withdrawal fell by 200,00."
function Explanation({ cats, diff }) {
  const up = cats.filter((c) => c.diff >= 1).sort((x, y) => y.diff - x.diff).slice(0, 2);
  const down = cats.filter((c) => c.diff <= -1).sort((x, y) => x.diff - y.diff).slice(0, 2);
  const main = diff >= 0 ? up : down;
  const other = diff >= 0 ? down.slice(0, 1) : up.slice(0, 1);
  if (!main.length) return null;
  const b = (c) => <Box component="b" sx={{ color: 'cockpit.tx', fontWeight: 600 }}>{c.label}</Box>;
  return (
    <Typography sx={{ fontSize: 14, lineHeight: 1.45, color: 'cockpit.tx2' }}>
      Mostly {b(main[0])} ({signed(main[0].diff)}){main[1] && <> and {b(main[1])} ({signed(main[1].diff)})</>}
      {other[0] && <>; {b(other[0])} {other[0].diff < 0 ? 'fell' : 'rose'} by {amount(Math.abs(other[0].diff))}</>}.
    </Typography>
  );
}

// Grows left of the centre line for less spent, right for more.
function DiffBar({ diff, max, height = 6 }) {
  const w = max ? Math.min(50, (Math.abs(diff) / max) * 50) : 0;
  return (
    <Box aria-hidden sx={{ position: 'relative', height, bgcolor: 'cockpit.panel2', borderRadius: height / 2 }}>
      <Box sx={{ position: 'absolute', left: '50%', top: -2, width: '1px', height: height + 4, bgcolor: 'cockpit.line2' }} />
      <Box sx={{ position: 'absolute', top: 0, height, borderRadius: height / 2, width: `${w}%`, ...(diff >= 0 ? { left: '50%', bgcolor: 'cockpit.neg' } : { right: '50%', bgcolor: 'cockpit.pos' }) }} />
    </Box>
  );
}

function Tag({ children, gone }) {
  return <Box component="span" sx={{ fontSize: 11, fontWeight: 600, px: '5px', py: '1px', borderRadius: '4px', bgcolor: gone ? 'cockpit.panel2' : 'cockpit.warnBg', color: gone ? 'cockpit.tx2' : 'cockpit.warn', flex: 'none' }}>{children}</Box>;
}
const tagOf = (n) => (n.a < 0.005 && n.b >= 0.005 ? 'new' : n.b < 0.005 && n.a >= 0.005 ? 'gone' : null);

// ---------- page ----------

export function ComparePage({ months, a, b, onChange, onMonthView }) {
  const known = useMemo(() => new Set(months.map((m) => m.month)), [months]);
  const sideA = useSide(a, b, known);
  const sideB = useSide(b, b, known);
  const cats = useComparison({ rowsA: sideA.data || [], rowsB: sideB.data || [], divA: sideA.divisor });
  const [sort, setSort] = useState('change');
  const [open, setOpen] = useState(null); // phones: the category expanded in place
  const [drill, setDrill] = useState(null); // the category in the side panel
  const wide = useMediaQuery((t) => t.breakpoints.up('md'));
  const pending = sideA.isPending || sideB.isPending;

  const labelA = sideLabel(a, sideA), labelB = sideLabel(b, sideB);
  const shortA = sideLabel(a, sideA, true), shortB = sideLabel(b, sideB, true);
  const totalA = cats.reduce((s, c) => s + c.a, 0), totalB = cats.reduce((s, c) => s + c.b, 0), diff = totalB - totalA;
  const max = Math.max(...cats.map((c) => Math.abs(c.diff)), 1);
  const shown = [...cats].sort(sort === 'change' ? (x, y) => Math.abs(y.diff) - Math.abs(x.diff) : sort === 'spent' ? (x, y) => y.b - x.b : (x, y) => x.label.localeCompare(y.label, 'el'));
  const drilled = drill && cats.find((c) => c.key === drill);
  const pick = (c) => (wide ? setDrill((d) => (d === c.key ? null : c.key)) : setOpen((o) => (o === c.key ? null : c.key)));

  const prev = addMonths(b, -1), lastYear = addMonths(b, -12);
  const presets = [['Previous month', prev, known.has(prev)], ['Same month last year', lastYear, known.has(lastYear)], ['vs 6-month average', AVG, true]];
  const monthField = (label, value, onPick, withAvg) => (
    <TextField select size="small" fullWidth label={label} value={value} onChange={(e) => onPick(e.target.value)}
      slotProps={{ select: { renderValue: (v) => (v === AVG ? (wide ? 'Average of 6 months' : '6-mo avg') : cap(wide ? formatMonth(v) : formatShortMonth(v))) } }}
      sx={{ m: 0, minWidth: 0, '& .MuiSelect-select': { fontWeight: 600 } }}>
      {withAvg && <MenuItem value={AVG}>Average of the 6 months before</MenuItem>}
      {months.map((m) => <MenuItem key={m.month} value={m.month}>{cap(formatMonth(m.month))}</MenuItem>)}
    </TextField>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, md: 2 }, pt: { xs: 1, md: 2 }, pb: 4 }}>
      <Title title="Compare months" />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 20, md: 26 }, fontWeight: 600 }}>Expenses</Typography>
        <ViewSwitch value="compare" onChange={onMonthView} />
      </Stack>

      <Box component="section" aria-label="Months" sx={{ bgcolor: 'cockpit.panel', borderRadius: '14px', p: { xs: 1.5, md: 2 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px minmax(0, 1fr)', alignItems: 'center', gap: 0.75, flex: { xs: '1 1 100%', md: '0 1 480px' } }}>
          {monthField('Before', a, (v) => onChange(v, b), true)}
          <IconButton aria-label="Swap months" disabled={a === AVG} onClick={() => onChange(b, a)} sx={{ width: 44, height: 44, bgcolor: 'cockpit.panel2' }}><SwapIcon /></IconButton>
          {monthField('After', b, (v) => onChange(a === v ? addMonths(v, -1) : a, v), false)}
        </Box>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {presets.map(([label, value, ok]) => (
            <Box key={label} component="button" type="button" disabled={!ok} aria-pressed={a === value} onClick={() => onChange(value, b)}
              sx={{ font: 'inherit', fontSize: 13, fontWeight: a === value ? 600 : 400, minHeight: 36, px: 1.5, borderRadius: '18px', cursor: ok ? 'pointer' : 'default', opacity: ok ? 1 : 0.45,
                border: 1, borderColor: a === value ? 'primary.main' : 'cockpit.line2', bgcolor: a === value ? 'cockpit.hatch' : 'cockpit.panel', color: a === value ? 'cockpit.accText' : 'cockpit.tx2' }}>
              {label}
            </Box>
          ))}
        </Stack>
      </Box>

      <Box component="section" aria-label="Totals" sx={{ bgcolor: 'cockpit.panel', borderRadius: '14px', p: { xs: 2, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {pending ? <Skeleton variant="rounded" height={88} /> : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
              <Box><Typography sx={{ fontSize: 13, color: 'cockpit.tx3', }}>{labelA}</Typography><Typography sx={{ ...mono, fontSize: { xs: 20, md: 24 }, fontWeight: 600 }}>{amount(totalA)} €</Typography></Box>
              <Box><Typography sx={{ fontSize: 13, color: 'cockpit.tx3', }}>{labelB}</Typography><Typography sx={{ ...mono, fontSize: { xs: 20, md: 24 }, fontWeight: 600 }}>{amount(totalB)} €</Typography></Box>
              <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, pt: { xs: 1.25, md: 0 }, borderTop: { xs: '1px solid', md: 'none' }, borderTopColor: { xs: 'cockpit.line' } }}>
                <Typography sx={{ fontSize: 13, color: 'cockpit.tx3' }}>Difference</Typography>
                <Typography sx={{ ...mono, fontSize: { xs: 20, md: 24 }, fontWeight: 600, color: tone(diff) }}>{signed(diff)} € <Box component="span" sx={{ fontSize: 14, fontWeight: 500 }}>{pct(diff, totalA)}</Box></Typography>
              </Box>
            </Box>
            <Explanation cats={cats} diff={diff} />
          </>
        )}
      </Box>

      <SplitLayout onClose={() => setDrill(null)}
        panel={drilled && <Drill cat={drilled} a={a} b={b} labelA={shortA} labelB={shortB} isAvg={a === AVG} onClose={() => setDrill(null)} />}>
        <Box component="section" aria-label="By category" sx={{ bgcolor: 'cockpit.panel', borderRadius: '14px', overflow: 'clip' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 2, py: 1.25 }}>
            <Typography component="h2" sx={{ fontSize: 17, fontWeight: 600, flex: 1 }}>By category</Typography>
            <Segments label="Sort" value={sort} onChange={setSort} options={[['change', 'Change'], ['spent', 'Spent'], ['name', 'A–Z']]} />
          </Stack>
          {/* Column heads on wider screens; phones read each row as two lines. */}
          <Box sx={{ ...rowGrid, display: { xs: 'none', md: 'grid' }, ...mono, fontSize: 13, color: 'cockpit.tx3', py: 1, borderTop: 1, borderColor: 'cockpit.line' }}>
            <span>Category</span>
            <Box component="span" sx={{ textAlign: 'right', }}>{shortA}</Box>
            <Box component="span" sx={{ textAlign: 'right', }}>{shortB}</Box>
            <Box component="span" sx={{ textAlign: 'right' }}>Δ €</Box>
            <Box component="span" sx={{ textAlign: 'right' }}>Δ %</Box>
            <Box component="span" sx={{ textAlign: 'center' }}>less · more</Box>
          </Box>
          <Stack direction="row" sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'space-between', px: 2, pb: 0.75, fontSize: 12, color: 'cockpit.tx3' }}>
            <span>less than before</span><span>more than before</span>
          </Stack>
          {pending && <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={260} /></Box>}
          {!pending && !shown.length && <Typography sx={{ color: 'cockpit.tx3', py: 5, textAlign: 'center' }}>No spending in either month.</Typography>}
          {!pending && shown.map((c) => (
            <Fragment key={c.key}>
              <CategoryRow c={c} max={max} active={drill === c.key || open === c.key} onClick={() => pick(c)} />
              {!wide && open === c.key && <Inline cat={c} onOpen={() => setDrill(c.key)} />}
            </Fragment>
          ))}
        </Box>
      </SplitLayout>
    </Box>
  );
}

const rowGrid = {
  display: 'grid',
  px: 2,
  columnGap: 1.5,
  alignItems: 'center',
  gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: 'minmax(0, 1fr) 96px 96px 104px 64px minmax(120px, 200px)' },
};

function CategoryRow({ c, max, active, onClick }) {
  const tag = tagOf(c);
  const cell = { ...mono, fontSize: 14, textAlign: 'right', display: { xs: 'none', md: 'block' } };
  return (
    <Box component="button" type="button" onClick={onClick} aria-expanded={active}
      sx={{ ...rowGrid, width: '100%', border: 0, borderTop: 1, borderColor: 'cockpit.line', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer',
        rowGap: 0.75, py: { xs: 1.25, md: 0 }, minHeight: { md: 44 }, bgcolor: active ? 'cockpit.hatch' : 'transparent', boxShadow: (t) => (active ? `inset 3px 0 0 ${t.palette.primary.main}` : 'none'), '&:hover': { bgcolor: active ? 'cockpit.hatch' : 'cockpit.panel2' } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: c.color, flex: 'none' }} />
        <Box component="span" sx={{ fontSize: 15, fontWeight: 600, minWidth: 0, overflowWrap: 'break-word', fontStyle: c.key === 'none' ? 'italic' : undefined, color: c.key === 'none' ? 'cockpit.warn' : undefined }}>{c.label}</Box>
        {tag && <Tag gone={tag === 'gone'}>{tag === 'gone' ? 'none' : tag}</Tag>}
      </Stack>
      <Box sx={{ ...cell, color: 'cockpit.tx2' }}>{c.a ? amount(c.a) : '—'}</Box>
      <Box sx={{ ...cell, fontWeight: 600 }}>{c.b ? amount(c.b) : '—'}</Box>
      <Box sx={{ ...mono, fontSize: 15, fontWeight: 600, textAlign: 'right', color: tone(c.diff) }}>{signed(c.diff)}</Box>
      <Box sx={{ ...cell, fontSize: 13, color: tone(c.diff) }}>{pct(c.diff, c.a) || 'new'}</Box>
      {/* Phones: "before → after" and the share of change on a second line. */}
      <Box sx={{ ...mono, display: { xs: 'block', md: 'none' }, fontSize: 13, color: 'cockpit.tx3', pl: '17px' }}>{amount(c.a)} → <Box component="b" sx={{ color: 'cockpit.tx', fontWeight: 600 }}>{amount(c.b)}</Box></Box>
      <Box sx={{ display: { xs: 'block', md: 'none' }, fontSize: 13, textAlign: 'right', color: tone(c.diff) }}>{pct(c.diff, c.a)}</Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, pl: { xs: '17px', md: 0 } }}><DiffBar diff={c.diff} max={max} /></Box>
    </Box>
  );
}

// Phones: a category opened in place; the full side-by-side view is one tap away.
function Inline({ cat, onOpen }) {
  const subs = cat.subs.length > 1 || (cat.subs[0] && cat.subs[0].key !== cat.key);
  const list = (subs ? [...cat.subs].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)) : cat.merchants).slice(0, 6);
  return (
    <Box sx={{ bgcolor: 'cockpit.panel2', px: 2, pl: '33px', pt: 0.5, pb: 1.5 }}>
      {list.map((n) => <NodeLine key={n.key} n={n} />)}
      <Button fullWidth variant="outlined" onClick={onOpen} sx={{ mt: 1.25, minHeight: 44, bgcolor: 'cockpit.panel' }}>Open {cat.label} side by side</Button>
    </Box>
  );
}

function NodeLine({ n }) {
  const tag = tagOf(n);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 1.25, rowGap: 0.25, py: 1, borderBottom: 1, borderColor: 'cockpit.line' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0, fontSize: 14, fontWeight: 500 }}><Box component="span" sx={{ overflowWrap: 'anywhere' }}>{n.label}</Box>{tag && <Tag gone={tag === 'gone'}>{tag}</Tag>}</Stack>
      <Box sx={{ ...mono, fontSize: 14, fontWeight: 600, textAlign: 'right', color: tone(n.diff) }}>{signed(n.diff)}</Box>
      <Box sx={{ ...mono, fontSize: 12.5, color: 'cockpit.tx3' }}>{amount(n.a)} → {amount(n.b)} · {countText(n.nA)} → {countText(n.nB)}</Box>
    </Box>
  );
}

const countText = (n) => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','));

// "Wolt +83,80: 7 payments instead of 4."
function changeSentence(m) {
  const tag = tagOf(m);
  if (tag === 'new') return [m.label, ` is new (${amount(m.b)}, ${countText(m.nB)} ${Math.round(m.nB) === 1 ? 'payment' : 'payments'}).`];
  if (tag === 'gone') return [m.label, `: ${amount(m.a)} before, nothing now.`];
  const counts = Math.round(m.nA * 10) !== Math.round(m.nB * 10) ? `: ${countText(m.nB)} payments instead of ${countText(m.nA)}` : ', same number of payments';
  return [m.label, ` ${signed(m.diff)}${counts}.`];
}

// ---------- side by side ----------

function Drill({ cat, a, b, labelA, labelB, isAvg, onClose }) {
  const [tab, setTab] = useState('b');
  const subs = cat.subs.length > 1 || (cat.subs[0] && cat.subs[0].key !== cat.key);
  const movers = cat.merchants.filter((m) => Math.abs(m.diff) >= 1).slice(0, 3);
  const pays = tab === 'a' ? cat.payA : cat.payB;
  const head = { ...mono, fontSize: 12, color: 'cockpit.tx3', textAlign: 'right', };
  const grid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 72px 72px 76px', columnGap: 0.75, alignItems: 'center', px: 1.5 };
  const table = (title, nodes) => (
    <Box component="section" aria-label={title} sx={{ py: 1.25, borderTop: 1, borderColor: 'cockpit.line' }}>
      <Box sx={{ ...grid, pb: 0.75 }}>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        <Box sx={head}>{labelA}</Box><Box sx={head}>{labelB}</Box><Box sx={head}>Δ</Box>
      </Box>
      {nodes.map((n) => {
        const tag = tagOf(n);
        return (
          <Box key={n.key} sx={{ ...grid, minHeight: 40, py: 0.5, borderTop: 1, borderColor: 'cockpit.line' }}>
            <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', minWidth: 0, fontSize: 14 }}><Box component="span" sx={{ overflowWrap: 'anywhere' }}>{n.label}</Box>{tag && <Tag gone={tag === 'gone'}>{tag}</Tag>}</Stack>
            <Box sx={{ ...mono, fontSize: 13, textAlign: 'right', color: 'cockpit.tx2' }}>{n.a >= 0.005 ? amount(n.a) : '—'}</Box>
            <Box sx={{ ...mono, fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{n.b >= 0.005 ? amount(n.b) : '—'}</Box>
            <Box sx={{ ...mono, fontSize: 13, textAlign: 'right', fontWeight: 600, color: tone(n.diff) }}>{signed(n.diff)}</Box>
          </Box>
        );
      })}
    </Box>
  );
  const ledger = (month, label) => (
    <Button component={RouterLink} to={transactionsLink({ month, category_id: cat.key })} variant="outlined" sx={{ flex: 1, minHeight: 44, textTransform: 'none' }}>{label} in the ledger</Button>
  );
  return (
    <Box sx={{ pb: 2 }}>
      <PanelHeader tag="Side by side" title={cat.label} subtitle={`${labelA} vs ${labelB}`} onClose={onClose}
        icon={<Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color }} />} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, px: 1.5, pb: 1.5 }}>
        {[[labelA, amount(cat.a), `${countText(cat.nA)} payments`], [labelB, amount(cat.b), `${countText(cat.nB)} payments`], ['Difference', signed(cat.diff), pct(cat.diff, cat.a)]].map(([l, v, n], i) => (
          <Box key={l}>
            <Typography sx={{ fontSize: 12.5, color: 'cockpit.tx3', }}>{l}</Typography>
            <Typography sx={{ ...mono, fontSize: 17, fontWeight: 600, color: i === 2 ? tone(cat.diff) : undefined }}>{v}</Typography>
            <Typography sx={{ fontSize: 12.5, color: i === 2 ? tone(cat.diff) : 'cockpit.tx3' }}>{n}</Typography>
          </Box>
        ))}
      </Box>
      {movers.length > 0 && (
        <Box component="section" aria-label="What changed" sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'cockpit.line', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600 }}>What changed</Typography>
          {movers.map((m) => { const [name, rest] = changeSentence(m); return <Typography key={m.key} sx={{ fontSize: 14, color: 'cockpit.tx2', lineHeight: 1.4 }}><Box component="b" sx={{ color: 'cockpit.tx', fontWeight: 600 }}>{name}</Box>{rest}</Typography>; })}
        </Box>
      )}
      {subs && table('Subcategories', [...cat.subs].sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)))}
      {table('Merchants', cat.merchants)}
      <Box component="section" aria-label="Payments" sx={{ px: 1.5, py: 1.25, borderTop: 1, borderColor: 'cockpit.line' }}>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>Payments</Typography>
        <Segments fullWidth label="Month" value={tab} onChange={setTab} options={[['a', `${labelA} · ${cat.payA.length}`], ['b', `${labelB} · ${cat.payB.length}`]]} />
        {isAvg && tab === 'a' && <Typography sx={{ fontSize: 12.5, color: 'cockpit.tx3', mt: 1 }}>Every payment of the months averaged.</Typography>}
        <Box sx={{ mt: 0.5 }}>
          {pays.slice(0, 60).map((r) => (
            <Stack key={`${r.id}-${r.split_id ?? 0}`} direction="row" sx={{ alignItems: 'center', gap: 1.25, minHeight: 40, borderTop: 1, borderColor: 'cockpit.line' }}>
              <Box sx={{ ...mono, fontSize: 13, color: 'cockpit.tx3', width: 46, flex: 'none' }}>{formatDayMonth(r.txn_date)}</Box>
              <Box sx={{ fontSize: 14, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{txnName(r).name}</Box>
              <Box sx={{ ...mono, fontSize: 14, fontWeight: 600, color: spendOf(r) < 0 ? 'cockpit.pos' : undefined }}>{spendOf(r) < 0 ? `+${amount(-spendOf(r))}` : amount(spendOf(r))}</Box>
            </Stack>
          ))}
          {!pays.length && <Typography sx={{ fontSize: 14, color: 'cockpit.tx3', py: 2 }}>No payments.</Typography>}
          {pays.length > 60 && <Typography sx={{ fontSize: 13, color: 'cockpit.tx3', pt: 1 }}>Showing 60 of {pays.length}.</Typography>}
        </Box>
        <Stack direction="row" sx={{ gap: 1, mt: 1.5 }}>
          {a !== AVG && ledger(a, labelA)}
          {ledger(b, labelB)}
        </Stack>
      </Box>
    </Box>
  );
}

// Guards the pair read from the address: B must be a month with data, A a month or the average.
export function comparePair(value, months) {
  const known = months.map((m) => m.month);
  const [rawA, rawB] = String(value || '').split(',');
  const b = known.includes(rawB) ? rawB : known[0];
  const a = rawA === AVG || known.includes(rawA) ? rawA : known.includes(addMonths(b, -1)) ? addMonths(b, -1) : AVG;
  return { a: a === b ? AVG : a, b };
}

