// Review › Cash & other: payments that have a category but say little about what
// the money was for (cash withdrawals, "Other" categories). Open one to split it
// into what it was really spent on, or to move it to a better category.

import { useState } from 'react';
import { Box, Button, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDataProvider } from 'react-admin';
import { Inspector } from '../transactions/Inspector.jsx';
import { SplitLayout } from '../components/SidePanel.jsx';
import { SortTh, sortRows } from '../components/SortTh.jsx';
import { hideBelowMd, hideBelowSm, rowSx, tableSx, tdSx, thSx } from '../components/dense.js';
import { useCategories } from '../hooks.js';
import { amount, formatDayMonth, txnName } from '../format.js';
import { num } from '../backend.js';

// Expense categories that hide what the money was for.
export const isVague = (c) => c.kind === 'expense' && /cash withdrawal|αναληψ|^other\b|^άλλα|unknown/i.test(c.name);
const PERIODS = [[3, 'Last 3 months'], [6, 'Last 6 months'], [12, 'Last 12 months'], [0, 'All time']];

// Counted back from the latest payment, so older data still shows something.
const since = (months, latest) => {
  if (!months || !latest) return null;
  const d = new Date(`${latest.slice(0, 7)}-01T00:00:00`);
  d.setMonth(d.getMonth() - months + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// The vague payments, with how much of each is still unexplained (not split off).
export function useExplainItems() {
  const dataProvider = useDataProvider();
  const { data: categories = [] } = useCategories();
  const ids = categories.filter(isVague).map((c) => c.id);
  const query = useQuery({
    queryKey: ['explain-items', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 2000 }, sort: { field: 'txn_date', order: 'DESC' }, filter: { category_id: ids } })).data
      .filter((r) => r.direction !== 'credit')
      .map((r) => ({ ...r, open: Math.max(0, Math.round((num(r.amount) - num(r.split_total)) * 100) / 100) })),
  });
  return { ...query, categories: categories.filter(isVague) };
}

export function ExplainList() {
  const { data = [], isPending, categories } = useExplainItems();
  const [period, setPeriod] = useState(6);
  const [category, setCategory] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [sort, setSort] = useState({ field: 'txn_date', order: 'DESC' });
  const [selectedId, setSelectedId] = useState(null);
  const from = since(period, data.reduce((m, r) => (r.txn_date > m ? r.txn_date : m), ''));
  const rows = data.filter((r) => (!from || r.txn_date >= from) && (!category || String(r.category_id) === category) && (!onlyOpen || r.open > 0))
    .map((r) => ({ ...r, name: txnName(r).name }));
  const shown = sortRows(rows, sort);
  const selected = data.find((r) => r.id === selectedId) || null;
  const openTotal = rows.reduce((s, r) => s + r.open, 0);
  const right = { textAlign: 'right' };

  if (!categories.length) {
    return <Typography sx={{ color: 'cockpit.tx3', py: 6, textAlign: 'center' }}>No cash-withdrawal or "Other" categories to review.</Typography>;
  }
  return (
    <SplitLayout panel={selected && <Inspector transaction={selected} onClose={() => setSelectedId(null)} splitOpen />} onClose={() => setSelectedId(null)}>
      <Box sx={{ bgcolor: 'cockpit.panel', borderRadius: '14px', overflow: 'hidden' }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 2, py: 1.5 }}>
          <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: 17, fontWeight: 600 }}>Cash & other</Typography>
            <Typography sx={{ fontSize: 14, color: 'cockpit.tx3' }}>
              {isPending ? 'Loading…' : <><b>{rows.length}</b> payments · <b>{amount(openTotal)} €</b> not explained yet. Open one to split it into what it was for.</>}
            </Typography>
          </Box>
          <TextField select size="small" fullWidth={false} label="Category" value={category} onChange={(e) => setCategory(e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ m: 0, width: { xs: '100%', sm: 190 } }}>
            <MenuItem value="">All</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" fullWidth={false} label="Period" value={period} onChange={(e) => setPeriod(Number(e.target.value))} sx={{ m: 0, width: { xs: '100%', sm: 160 } }}>
            {PERIODS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <Button variant={onlyOpen ? 'contained' : 'outlined'} onClick={() => setOnlyOpen((v) => !v)} aria-pressed={onlyOpen}>
            {onlyOpen ? 'Not yet split' : 'All, including split'}
          </Button>
        </Stack>
        {isPending ? <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={240} /></Box> : !rows.length ? (
          <Typography sx={{ color: 'cockpit.tx3', py: 6, textAlign: 'center' }}>{onlyOpen ? 'All explained for this period.' : 'Nothing in this period.'}</Typography>
        ) : (
          <Box component="table" sx={tableSx}>
            <thead><tr>
              <SortTh field="txn_date" sort={sort} onSort={setSort} sx={{ ...thSx, width: { xs: 64, sm: 80 } }}>Date</SortTh>
              <SortTh field="name" first="ASC" sort={sort} onSort={setSort} sx={thSx}>Description</SortTh>
              <SortTh field="category" first="ASC" sort={sort} onSort={setSort} sx={{ ...thSx, ...hideBelowSm, width: '20%' }}>Category</SortTh>
              <SortTh field="amount" sort={sort} onSort={setSort} sx={{ ...thSx, ...hideBelowMd, ...right, width: 104 }}>Amount</SortTh>
              <SortTh field="open" sort={sort} onSort={setSort} sx={{ ...thSx, ...right, width: { xs: 104, sm: 128 } }}>Not explained</SortTh>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <Box component="tr" key={r.id} onClick={() => setSelectedId((id) => (id === r.id ? null : r.id))} aria-selected={selectedId === r.id} sx={rowSx({ active: selectedId === r.id })}>
                  <Box component="td" sx={{ ...tdSx, color: 'cockpit.tx2' }}>{formatDayMonth(r.txn_date)}</Box>
                  <Box component="td" sx={tdSx} title={[r.name, r.note].filter(Boolean).join(' · ')}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{r.name}</Box>
                    {r.note && <Box component="span" sx={{ color: 'cockpit.tx3', ml: 1, display: { xs: 'none', sm: 'inline' } }}>{r.note}</Box>}
                    {r.split_count > 0 && <Box component="span" sx={{ color: 'cockpit.tx3', ml: 1 }}>· split</Box>}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, color: 'cockpit.tx2' }}>{r.category}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...right, color: 'cockpit.tx2' }}>{amount(r.amount)}</Box>
                  <Box component="td" sx={{ ...tdSx, ...right, fontWeight: 600, color: r.open ? 'cockpit.tx' : 'cockpit.pos' }}>{r.open ? amount(r.open) : '✓'}</Box>
                </Box>
              ))}
            </tbody>
          </Box>
        )}
      </Box>
    </SplitLayout>
  );
}
