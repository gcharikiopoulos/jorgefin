// Review queue: one dense row per uncategorised description; the panel on the
// right creates a rule for it. Keyboard: J/K move, Enter open, C category, Esc close.

import { useEffect, useRef, useState } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { List, Title, useListContext } from 'react-admin';
import { useSearchParams } from 'react-router-dom';
import { ExplainList, useExplainItems } from './ExplainList.jsx';
import { useMonths } from '../hooks.js';
import { CategorizePanel } from '../components/CategorizePanel.jsx';
import { SplitLayout } from '../components/SidePanel.jsx';
import { hideBelowMd, hideBelowSm, isTyping, rowSx, tableSx, tdSx, thSx } from '../components/dense.js';
import { Label, Mono } from '../dashboard/parts.jsx';
import { formatDayMonth, formatDate, sameText, signedAmount } from '../format.js';
import { monoSx } from '../theme.js';
import { num } from '../backend.js';

function Empty() {
  return (
    <Box sx={{ mt: 0.75, py: 6, textAlign: 'center', bgcolor: 'cockpit.panel', borderRadius: '14px' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'cockpit.pos' }} />
        <Mono sx={{ fontSize: 17, fontWeight: 600 }}>All caught up</Mono>
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
        sx={{ all: 'unset', boxSizing: 'border-box', width: '100%', height: '100%', px: 1.5, cursor: 'pointer', textAlign: 'inherit', color: on ? 'cockpit.tx' : 'inherit', '&:focus-visible': { outline: 1, outlineColor: 'primary.main' } }}>
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
      <Box sx={{ bgcolor: 'cockpit.panel', borderRadius: '14px', overflow: 'hidden' }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 56, px: 2, py: 1.25 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <Label component="h1" sx={{ color: 'cockpit.tx', m: 0, fontSize: 17, fontWeight: 600 }}>To review</Label>
          </Stack>
          <Mono sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: 14, color: 'cockpit.tx3', '& b': { fontWeight: 600, color: 'cockpit.tx' } }}>
            <span><b>{data.length}</b> {data.length === 1 ? 'description' : 'descriptions'}</span>
            <span><b>{txns}</b> transactions</span>
            <span>Out <b>{signedAmount(out)}</b></span>
            {inn > 0 && <span>In <Box component="b" sx={{ color: 'cockpit.pos !important' }}>{signedAmount(inn)}</Box></span>}
          </Mono>
          <Box sx={{ flexGrow: 1 }} />
          <Label sx={{ display: { xs: 'none', md: 'inline' } }}>One rule categorises every transaction with the description, now and later.</Label>
        </Stack>
        <Box component="table" sx={tableSx}>
          <thead><tr>
            <SortHead field="sample_description">Description</SortHead>
            <SortHead field="txn_count" sx={{ width: 64, textAlign: 'right' }}>Count</SortHead>
            <SortHead field="debit_count" sx={{ ...hideBelowSm, width: 96 }}>Out · in</SortHead>
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
                    <Box component="span" sx={{ fontWeight: 600 }}>{r.sample_description || r.description_norm}</Box>
                    {norm && <Mono sx={{ fontSize: 13, color: 'cockpit.tx3', ml: 1, display: { xs: 'none', sm: 'inline' } }}>{norm}</Mono>}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...monoSx, textAlign: 'right', fontWeight: 600 }}>{num(r.txn_count)}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowSm, ...monoSx, fontSize: 13.5, color: 'cockpit.tx3' }}>{outN} · {inN}</Box>
                  <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...monoSx, fontSize: 13.5, color: 'cockpit.tx2' }} title={`${formatDate(r.first_seen)} – ${formatDate(r.last_seen)}`}>
                    {r.first_seen === r.last_seen ? formatDayMonth(r.first_seen) : `${formatDayMonth(r.first_seen)} – ${formatDayMonth(r.last_seen)}`}
                  </Box>
                  <Box component="td" sx={{ ...tdSx, ...monoSx, fontWeight: 600, textAlign: 'right', color: num(r.net_amount) > 0 ? 'cockpit.pos' : 'cockpit.tx' }}>{signedAmount(r.net_amount)}</Box>
                </Box>
              );
            })}
          </tbody>
        </Box>
      </Box>
    </SplitLayout>
  );
}

function ReviewTabs({ tab, onChange }) {
  const { data: months = [] } = useMonths();
  const uncat = months.reduce((s, m) => s + num(m.uncategorized_count), 0);
  const { data: vague = [] } = useExplainItems();
  const open = vague.filter((r) => r.open > 0).length;
  const tabs = [['uncat', 'Uncategorised', uncat], ['explain', 'Cash & other', open]];
  return (
    <Box role="tablist" aria-label="Review" sx={{ display: 'flex', gap: 0.5, mt: 1.25, mb: 1.25, p: 0.5, bgcolor: 'cockpit.panel', borderRadius: '12px', width: 'fit-content', maxWidth: '100%' }}>
      {tabs.map(([key, label, count]) => (
        <Box key={key} component="button" type="button" role="tab" aria-selected={tab === key} onClick={() => onChange(key)}
          sx={{ font: 'inherit', fontSize: 15, fontWeight: tab === key ? 600 : 500, border: 0, cursor: 'pointer', borderRadius: '9px', px: 2, minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 1,
            bgcolor: tab === key ? 'cockpit.hatch' : 'transparent', color: tab === key ? 'cockpit.accText' : 'cockpit.tx2' }}>
          {label}
          {count > 0 && <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'cockpit.warn', bgcolor: 'cockpit.warnBg', borderRadius: '999px', px: '7px', lineHeight: '18px' }}>{count}</Box>}
        </Box>
      ))}
    </Box>
  );
}

export function ReviewList() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'explain' ? 'explain' : 'uncat';
  const onTab = (t) => setParams(t === 'explain' ? { tab: 'explain' } : {}, { replace: true });
  return (
    <Box>
      <ReviewTabs tab={tab} onChange={onTab} />
      {tab === 'uncat' ? (
        <List title="Review" actions={false} component="div" sort={{ field: 'txn_count', order: 'DESC' }} perPage={200} exporter={false} empty={<Empty />} pagination={false} sx={{ '& .RaList-main': { mt: 0 } }}>
          <ReviewBody />
        </List>
      ) : (
        <>
          <Title title="Review" />
          <ExplainList />
        </>
      )}
    </Box>
  );
}
