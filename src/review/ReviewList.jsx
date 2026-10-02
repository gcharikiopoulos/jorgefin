// Review queue: one dense row per uncategorised description; the panel on the
// right creates a rule for it. Keyboard: J/K move, Enter open, C category, Esc close.

import { useEffect, useRef, useState } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { List, useListContext } from 'react-admin';
import { CategorizePanel } from '../components/CategorizePanel.jsx';
import { SplitLayout } from '../components/SidePanel.jsx';
import { hideBelowMd, hideBelowSm, isTyping, rowSx, tableSx, tdSx, thSx } from '../components/dense.js';
import { Kbd, Label, Mono } from '../dashboard/parts.jsx';
import { formatDayMonth, formatDate, sameText, signedAmount } from '../format.js';
import { monoSx } from '../theme.js';
import { num } from '../backend.js';

function Empty() {
  return (
    <Box sx={{ mt: 0.75, py: 6, textAlign: 'center', bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '1px', bgcolor: 'cockpit.pos' }} />
        <Mono sx={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em' }}>ALL CAUGHT UP</Mono>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Every transaction has a category.</Typography>
    </Box>
  );
}

// Column head that sorts the list; a second click flips the order.
function SortHead({ field, children, sx }) {
  const { sort, setSort } = useListContext();
  const on = sort.field === field;
  return (
    <Box component="th" aria-sort={on ? (sort.order === 'ASC' ? 'ascending' : 'descending') : 'none'} sx={{ ...thSx, ...sx, p: 0 }}>
      <Box component="button" type="button" onClick={() => setSort({ field, order: on && sort.order === 'DESC' ? 'ASC' : 'DESC' })}
        sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', height: '100%', px: 0.875, cursor: 'pointer', textAlign: 'inherit', color: on ? 'cockpit.tx' : 'inherit', '&:focus-visible': { outline: 1, outlineColor: 'primary.main' } }}>
        {children}{on ? (sort.order === 'ASC' ? ' ▴' : ' ▾') : ''}
      </Box>
    </Box>
  );
}

function ReviewBody() {
  const { data = [], isPending } = useListContext();
  const [selectedId, setSelectedId] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const rowRefs = useRef(new Map());
  const selected = data.find((r) => r.id === selectedId) || null;

  // After a rule is saved its group leaves the queue: move on to the next one.
  const next = (item) => {
    const i = data.findIndex((r) => r.id === item.id);
    const rest = data.filter((r) => r.id !== item.id);
    const n = rest.length ? Math.min(Math.max(i, 0), rest.length - 1) : -1;
    setSelectedId(n >= 0 ? rest[n].id : null);
    setCursor(n);
  };
  const openAt = (i) => { if (data[i]) { setCursor(i); setSelectedId(data[i].id); } };

  useEffect(() => {
    const row = data[cursor];
    if (row) rowRefs.current.get(row.id)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, data]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (isTyping(e)) return;
      const step = (d) => {
        e.preventDefault();
        const n = Math.max(0, Math.min(data.length - 1, cursor + d));
        setCursor(n);
        if (selectedId != null && data[n]) setSelectedId(data[n].id);
      };
      if (e.key === 'j' || e.key === 'ArrowDown') step(1);
      else if (e.key === 'k' || e.key === 'ArrowUp') step(-1);
      else if ((e.key === 'Enter' || e.key === 'c') && data[cursor]) {
        e.preventDefault();
        setSelectedId(data[cursor].id);
        if (e.key === 'c') setTimeout(() => document.getElementById('review-category')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, cursor, selectedId]);

  const txns = data.reduce((s, r) => s + num(r.txn_count), 0);
  const out = data.reduce((s, r) => s + Math.min(num(r.net_amount), 0), 0);
  const inn = data.reduce((s, r) => s + Math.max(num(r.net_amount), 0), 0);

  return (
    <SplitLayout panel={selected && <CategorizePanel item={selected} onClose={() => setSelectedId(null)} onSaved={next} />} onClose={() => setSelectedId(null)}>
      <Box sx={{ bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 42, px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'cockpit.line' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '1px', bgcolor: data.length ? 'cockpit.warn' : 'cockpit.pos', opacity: 0.85 }} />
            <Label component="h1" sx={{ color: 'cockpit.tx', m: 0 }}>Review queue</Label>
          </Stack>
          <Mono sx={{ display: 'flex', gap: 1.5, fontSize: 12, color: 'cockpit.tx3', '& b': { fontWeight: 600, color: 'cockpit.tx' } }}>
            <span>DESCRIPTIONS <b>{data.length}</b></span>
            <span>TXNS <b>{txns}</b></span>
            <span>OUT <b>{signedAmount(out)}</b></span>
            {inn > 0 && <span>IN <Box component="b" sx={{ color: 'cockpit.pos !important' }}>{signedAmount(inn)}</Box></span>}
          </Mono>
          <Box sx={{ flexGrow: 1 }} />
          <Label sx={{ textTransform: 'none', letterSpacing: '0.02em', display: { xs: 'none', md: 'inline' } }}>One rule categorises every transaction with the description, now and later.</Label>
        </Stack>
        <Box component="table" sx={tableSx}>
          <thead><tr>
            <SortHead field="sample_description">Description</SortHead>
            <SortHead field="txn_count" sx={{ width: 64, textAlign: 'right' }}>Txns</SortHead>
            <Box component="th" sx={{ ...thSx, ...hideBelowSm, width: 96 }}>Out · in</Box>
            <SortHead field="last_seen" sx={{ ...hideBelowMd, width: 150 }}>Seen</SortHead>
            <SortHead field="net_amount" sx={{ width: 100, textAlign: 'right' }}>Net €</SortHead>
          </tr></thead>
          <tbody>
            {isPending && [0, 1, 2, 3].map((i) => <tr key={i}><Box component="td" colSpan={5} sx={{ ...tdSx, maxWidth: 'none' }}><Skeleton height={18} /></Box></tr>)}
            {data.map((r, i) => {
              const norm = !sameText(r.sample_description, r.description_norm) ? r.description_norm : '';
              const outN = num(r.debit_count), inN = num(r.credit_count);
              return (
                <Box component="tr" key={r.id} ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
                  onClick={() => (selectedId === r.id ? setSelectedId(null) : openAt(i))} aria-selected={selectedId === r.id}
                  sx={rowSx({ active: selectedId === r.id, cursor: i === cursor })}>
                  <Box component="td" sx={tdSx} title={[r.sample_description, norm].filter(Boolean).join(' · ')}>
                    <Box component="span" sx={{ ...monoSx, fontSize: 12.5, fontWeight: 600 }}>{r.sample_description || r.description_norm}</Box>
                    {norm && <Mono sx={{ fontSize: 11.5, color: 'cockpit.tx3', ml: 1, display: { xs: 'none', sm: 'inline' } }}>{norm}</Mono>}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 12.5, textAlign: 'right', fontWeight: 600 }}>{num(r.txn_count)}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...monoSx, fontSize: 12, color: 'cockpit.tx3' }}>{outN} · {inN}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...monoSx, fontSize: 12, color: 'cockpit.tx2' }} title={`${formatDate(r.first_seen)} – ${formatDate(r.last_seen)}`}>
                    {r.first_seen === r.last_seen ? formatDayMonth(r.first_seen) : `${formatDayMonth(r.first_seen)} – ${formatDayMonth(r.last_seen)}`}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 13, fontWeight: 600, textAlign: 'right', color: num(r.net_amount) > 0 ? 'cockpit.pos' : 'cockpit.tx' }}>{signedAmount(r.net_amount)}</Box>
                </Box>
              );
            })}
          </tbody>
        </Box>
        <Mono component="div" sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.5, px: 1.25, py: 0.75, fontSize: 11, color: 'cockpit.tx3' }}>
          <span>Click a row to make a rule; the next one opens after saving</span>
          <Box sx={{ flexGrow: 1 }} />
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
          <span><Kbd>⏎</Kbd> open</span>
          <span><Kbd>C</Kbd> category</span>
          <span><Kbd>Esc</Kbd> close</span>
        </Mono>
      </Box>
    </SplitLayout>
  );
}

export function ReviewList() {
  return (
    <List title="Review" actions={false} component="div" sort={{ field: 'txn_count', order: 'DESC' }} perPage={200} exporter={false} empty={<Empty />} pagination={false} sx={{ '& .RaList-main': { mt: 1.25 } }}>
      <ReviewBody />
    </List>
  );
}
