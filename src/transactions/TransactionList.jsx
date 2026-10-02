// The ledger: a filter rail, rows grouped by day with daily totals, multi-select with
// a bulk category bar, and an inspector on the right. Keyboard: J/K move, X select,
// C or Enter inspect, / search, Esc close.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, Drawer, MenuItem, Skeleton, Stack, TextField, useMediaQuery } from '@mui/material';
import { List, Loading, Pagination, useDataProvider, useListContext, useNotify, useRefresh } from 'react-admin';
import { CategoryTag } from '../components/CategoryTag.jsx';
import { CategorySelect } from '../components/CategorySelect.jsx';
import { Kbd, Label, Mono } from '../dashboard/parts.jsx';
import { Inspector } from './Inspector.jsx';
import { amount, categoryTree, formatMonth, formatTime, parseDate, signedAmount, sourceShort, txnName, txnTypeLabel } from '../format.js';
import { useCategories, useMonths, useRefreshAfterWrite } from '../hooks.js';
import { monoSx } from '../theme.js';
import { CONTROL, ROW, TOP_BAR } from '../components/dense.js';
import { num } from '../backend.js';

const INSPECTOR_WIDTH = 340;
const dayFmt = new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const TYPES = [['card_purchase', 'Card purchase'], ['card_refund', 'Card refund'], ['atm_withdrawal', 'Cash withdrawal'], ['transfer', 'Transfer'], ['payment', 'Payment']];
const SOURCES = [['card_alert', 'Card alert'], ['account_alert', 'Account alert'], ['statement_csv', 'Statement'], ['manual', 'By hand']];
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.target.closest?.('[role="listbox"], [role="dialog"]');

// ---------- filter rail ----------

function RailSelect({ label, value, onChange, children, width = 150 }) {
  return (
    <Stack direction="row" component="label" sx={{ alignItems: 'center', gap: 0.75, height: CONTROL, pl: 1.25, pr: 0.5, border: 1, borderColor: value ? 'primary.main' : 'cockpit.line2', borderRadius: '3px', bgcolor: 'cockpit.panel2' }}>
      <Label sx={{ fontSize: 10.5 }}>{label}</Label>
      <TextField
        select
        variant="standard"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        slotProps={{ input: { disableUnderline: true }, htmlInput: { 'aria-label': label }, select: { displayEmpty: true } }}
        sx={{ m: 0, width: { xs: '100%', sm: width }, flex: { xs: 1, sm: 'none' }, alignSelf: 'stretch', height: '100%', '& .MuiInputBase-root': { height: '100%' }, '& .MuiSelect-select': { height: '100% !important', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }, '& .MuiSelect-select.MuiSelect-select': { fontSize: { xs: 16, sm: 13.5 }, py: 0, color: 'cockpit.tx' } }}
      >
        {children}
      </TextField>
    </Stack>
  );
}

function SearchBox({ value, onChange, inputRef }) {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);
  useEffect(() => {
    if ((value || '') === text) return undefined;
    const id = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Stack direction="row" component="label" sx={{ alignItems: 'center', gap: 1, height: CONTROL, px: 1.25, border: 1, borderColor: 'cockpit.line2', borderRadius: '3px', bgcolor: 'cockpit.panel2', width: { xs: 'auto', sm: 260 }, flex: { xs: 1, sm: 'none' }, minWidth: 0, '&:focus-within': { borderColor: 'primary.main' } }}>
      <Box component="svg" width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} sx={{ color: 'cockpit.tx3', flex: 'none' }} aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 L14 14" /></Box>
      <Box component="input" ref={inputRef} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Merchant or description" aria-label="Search transactions"
        sx={{ flexGrow: 1, alignSelf: 'stretch', minWidth: 0, bgcolor: 'transparent', border: 0, outline: 'none', color: 'cockpit.tx', font: 'inherit', fontSize: { xs: 16, sm: 13.5 } }} />
      <Kbd>/</Kbd>
    </Stack>
  );
}

function Segmented({ value, onChange, options, label }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'inline-flex', border: 1, borderColor: 'cockpit.line2', borderRadius: '3px', overflow: 'hidden', height: CONTROL }}>
      {options.map(([v, text], i) => (
        <Box key={text} component="button" type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          sx={{ ...monoSx, border: 0, borderLeft: i ? 1 : 0, borderColor: 'cockpit.line2', px: { xs: 2, sm: 1.5 }, fontSize: 12, fontWeight: 600, cursor: 'pointer', bgcolor: value === v ? 'primary.main' : 'cockpit.panel2', color: value === v ? '#fff' : 'cockpit.tx2' }}>
          {text}
        </Box>
      ))}
    </Box>
  );
}

function FilterRail({ searchRef, rows }) {
  const { filterValues, setFilters, total } = useListContext();
  const { data: months = [] } = useMonths();
  const { data: categories = [] } = useCategories();
  const set = (key, value) => {
    const next = { ...filterValues, [key]: value };
    if (value === '' || value == null) delete next[key];
    setFilters(next, undefined);
  };
  const uncatOnly = filterValues.category_id === 'none';
  // On phones the filters fold away behind one button; search stays visible.
  const [open, setOpen] = useState(false);
  const active = ['month', 'category_id', 'txn_type', 'source', 'direction'].filter((k) => filterValues[k] != null && filterValues[k] !== '').length;
  const inflow = rows.filter((r) => r.direction === 'credit').reduce((s, r) => s + num(r.signed_amount), 0);
  const outflow = rows.filter((r) => r.direction !== 'credit').reduce((s, r) => s + num(r.signed_amount), 0);
  const uncatCount = rows.filter((r) => r.category_id == null).length;
  return (
    <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, py: 1.25, px: 1.5, bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px 3px 0 0' }}>
      <SearchBox value={filterValues.q} onChange={(v) => set('q', v)} inputRef={searchRef} />
      <Button variant="outlined" onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ display: { xs: 'inline-flex', sm: 'none' }, height: 44, borderColor: active ? 'primary.main' : 'cockpit.line2', color: 'cockpit.tx' }}>
        Filters{active ? ` · ${active}` : ''} {open ? '▴' : '▾'}
      </Button>
      <Box sx={{ display: { xs: open ? 'contents' : 'none', sm: 'contents' } }}>
      <RailSelect label="Month" value={filterValues.month} onChange={(v) => set('month', v)} width={130}>
        <MenuItem value="">All months</MenuItem>
        {months.map((m) => <MenuItem key={m.month} value={m.month} sx={{ textTransform: 'capitalize' }}>{formatMonth(m.month)}</MenuItem>)}
      </RailSelect>
      <RailSelect label="Category" value={filterValues.category_id} onChange={(v) => set('category_id', v)} width={140}>
        <MenuItem value="">All</MenuItem>
        <MenuItem value="none">Uncategorised</MenuItem>
        {categoryTree(categories).flatMap((p) => [
          <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>,
          ...p.children.map((c) => <MenuItem key={c.id} value={c.id} sx={{ pl: 3.5 }}>{c.name}</MenuItem>),
        ])}
      </RailSelect>
      <RailSelect label="Type" value={filterValues.txn_type} onChange={(v) => set('txn_type', v)} width={110}>
        <MenuItem value="">All</MenuItem>
        {TYPES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
      </RailSelect>
      <RailSelect label="Source" value={filterValues.source} onChange={(v) => set('source', v)} width={100}>
        <MenuItem value="">All</MenuItem>
        {SOURCES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
      </RailSelect>
      <Segmented label="Direction" value={filterValues.direction ?? ''} onChange={(v) => set('direction', v)} options={[['', 'ALL'], ['credit', 'IN'], ['debit', 'OUT']]} />
      <Box component="button" type="button" aria-pressed={uncatOnly} onClick={() => set('category_id', uncatOnly ? '' : 'none')}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: CONTROL, px: 1.25, font: 'inherit', fontSize: 13.5, cursor: 'pointer', borderRadius: '3px', border: 1, borderColor: uncatOnly ? 'cockpit.warn' : 'cockpit.line2', bgcolor: uncatOnly ? 'cockpit.warnBg' : 'cockpit.panel2', color: uncatOnly ? 'cockpit.warn' : 'cockpit.tx2' }}>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: '1px', border: 1, borderColor: 'cockpit.warn', bgcolor: uncatOnly ? 'cockpit.warn' : 'transparent' }} />
        Uncategorised only
        {!uncatOnly && uncatCount > 0 && <Mono sx={{ fontSize: 11.5, color: 'cockpit.warn' }}>{uncatCount}</Mono>}
      </Box>
      </Box>
      <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'block' } }} />
      <Mono sx={{ display: { xs: 'none', md: 'flex' }, gap: 1.5, fontSize: 12, color: 'cockpit.tx3', '& b': { fontWeight: 600 } }}>
        <span>ROWS <Box component="b" sx={{ color: 'cockpit.tx' }}>{rows.length < (total ?? 0) ? `${rows.length}/${total}` : total ?? 0}</Box></span>
        <span>IN <Box component="b" sx={{ color: 'cockpit.pos' }}>{signedAmount(inflow)}</Box></span>
        <span>OUT <Box component="b" sx={{ color: 'cockpit.tx' }}>{signedAmount(outflow)}</Box></span>
        <span>NET <Box component="b" sx={{ color: inflow + outflow >= 0 ? 'cockpit.pos' : 'cockpit.neg' }}>{signedAmount(inflow + outflow)}</Box></span>
      </Mono>
    </Stack>
  );
}

// ---------- bulk bar ----------

function BulkBar({ rows, selected, onClear }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const refreshQueries = useRefreshAfterWrite();
  const [categoryId, setCategoryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const chosen = rows.filter((r) => selected.has(r.id));
  const sum = chosen.reduce((s, r) => s + num(r.signed_amount), 0);
  const apply = async () => {
    if (!categoryId) return;
    setSaving(true);
    try {
      for (const r of chosen) await dataProvider.setCategory({ txnId: r.id, categoryId, note: r.note ?? null });
      notify(`Category set on ${chosen.length} ${chosen.length === 1 ? 'transaction' : 'transactions'}`, { type: 'success' });
      onClear();
      refreshQueries();
      refresh();
    } catch (err) {
      console.error(err);
      notify(navigator.onLine ? 'Could not save every transaction. Please try again.' : 'You are offline.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.5, py: 1, bgcolor: 'cockpit.panel2', borderInline: 1, borderBottom: 1, borderColor: 'primary.main' }}>
      <Mono sx={{ fontSize: 12.5, fontWeight: 700, color: 'cockpit.accText' }}>{chosen.length} SELECTED</Mono>
      <Mono sx={{ fontSize: 12, color: 'cockpit.tx3' }}>{signedAmount(sum)} €</Mono>
      <Box sx={{ width: { xs: '100%', sm: 240 } }}><CategorySelect value={categoryId} onChange={setCategoryId} label="Set category" /></Box>
      <Button variant="contained" onClick={apply} disabled={!categoryId || saving}>Apply to {chosen.length}</Button>
      <Button onClick={onClear}>Clear <Box component="span" sx={{ ml: 0.75 }}><Kbd>Esc</Kbd></Box></Button>
    </Stack>
  );
}

// ---------- table ----------

const th = { ...monoSx, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'cockpit.tx3', textAlign: 'left', px: 1.25, height: 32, borderBottom: 1, borderColor: 'cockpit.line2', whiteSpace: 'nowrap', bgcolor: 'cockpit.panel', position: 'sticky', top: TOP_BAR, zIndex: 1 };
const td = { px: 1.25, height: ROW, fontSize: 13.5, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 };
const hideSm = { display: { xs: 'none', md: 'table-cell' } };
const hideXs = { display: { xs: 'none', sm: 'table-cell' } };

function Ledger() {
  const { data, isPending, filterValues } = useListContext();
  const rows = useMemo(() => data || [], [data]);
  const wide = useMediaQuery((t) => t.breakpoints.up('lg'));
  const md = useMediaQuery((t) => t.breakpoints.up('md'));
  const sm = useMediaQuery((t) => t.breakpoints.up('sm'));
  const cols = md ? 7 : sm ? 5 : 3; // columns actually shown, for the full-width rows
  const [cursor, setCursor] = useState(-1);
  const [inspectId, setInspectId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const searchRef = useRef(null);
  const rowRefs = useRef(new Map());

  // A new filter starts from the top with nothing selected.
  const filterKey = JSON.stringify(filterValues);
  useEffect(() => { setCursor(-1); setSelected(new Set()); }, [filterKey]);

  const inspected = rows.find((r) => r.id === inspectId) || null;
  const inspectAt = (i) => { if (rows[i]) { setCursor(i); setInspectId(rows[i].id); } };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  useEffect(() => {
    const row = rows[cursor];
    if (row) rowRefs.current.get(row.id)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, rows]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (inspectId != null) setInspectId(null); else setSelected(new Set());
        return;
      }
      if (typing(e)) return;
      const step = (d) => {
        e.preventDefault();
        const next = Math.max(0, Math.min(rows.length - 1, cursor + d));
        setCursor(next);
        if (inspectId != null && rows[next]) setInspectId(rows[next].id);
      };
      if (e.key === 'j' || e.key === 'ArrowDown') step(1);
      else if (e.key === 'k' || e.key === 'ArrowUp') step(-1);
      else if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'x' && rows[cursor]) toggle(rows[cursor].id);
      else if ((e.key === 'Enter' || e.key === 'c') && rows[cursor]) {
        e.preventDefault();
        setInspectId(rows[cursor].id);
        if (e.key === 'c') setTimeout(() => document.getElementById('inspector-category')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, inspectId]);

  // Group by day, keeping the server's order (date, time, entry).
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.txn_date) last.rows.push(r);
    else groups.push({ date: r.txn_date, rows: [r] });
  }
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const inspectorProps = inspected && {
    transaction: inspected,
    onClose: () => setInspectId(null),
    onPrev: cursor > 0 ? () => inspectAt(cursor - 1) : undefined,
    onNext: cursor < rows.length - 1 ? () => inspectAt(cursor + 1) : undefined,
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: wide && inspected ? `minmax(0, 1fr) ${INSPECTOR_WIDTH}px` : 'minmax(0, 1fr)', gap: '8px', alignItems: 'start', pt: 1.25 }}>
      <Box sx={{ minWidth: 0 }}>
        <FilterRail searchRef={searchRef} rows={rows} />
        {selected.size > 0 && <BulkBar rows={rows} selected={selected} onClear={() => setSelected(new Set())} />}
        <Box sx={{ bgcolor: 'cockpit.panel', borderInline: 1, borderBottom: 1, borderColor: 'cockpit.line' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <Box component="th" sx={{ ...th, ...hideXs, width: 30 }}>
                  <Checkbox size="small" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} slotProps={{ input: { 'aria-label': 'Select all' } }} sx={{ p: 0 }} />
                </Box>
                <Box component="th" sx={{ ...th, ...hideXs, width: 72 }}>Time</Box>
                <Box component="th" sx={th}>Merchant · bank description</Box>
                <Box component="th" sx={{ ...th, ...hideSm, width: 130 }}>Type</Box>
                <Box component="th" sx={{ ...th, width: { xs: 112, sm: 170 } }}>Category</Box>
                <Box component="th" sx={{ ...th, ...hideSm, width: 68 }}>Src</Box>
                <Box component="th" sx={{ ...th, width: { xs: 104, sm: 112 }, textAlign: 'right' }}>Amount €</Box>
              </tr>
            </thead>
            <tbody>
              {isPending && [0, 1, 2, 3, 4, 5].map((i) => <tr key={i}><Box component="td" colSpan={cols} sx={{ ...td, maxWidth: 'none' }}><Skeleton height={18} /></Box></tr>)}
              {!isPending && rows.length === 0 && (
                <tr><Box component="td" colSpan={cols} sx={{ ...td, maxWidth: 'none', height: 80, textAlign: 'center', color: 'cockpit.tx3' }}>No transactions match these filters.</Box></tr>
              )}
              {groups.map((g) => {
                const dayTotal = g.rows.reduce((s, r) => s + num(r.signed_amount), 0);
                return (
                  <Fragment key={g.date}>
                    <tr>
                      <Box component="td" colSpan={cols} sx={{ ...td, maxWidth: 'none', height: { xs: 36, md: 30 }, bgcolor: 'cockpit.bg', borderBottomColor: 'cockpit.line2' }}>
                        <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1 }}>
                          <Mono sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', color: 'cockpit.tx', textTransform: 'uppercase' }}>{dayFmt.format(parseDate(g.date))}</Mono>
                          <Mono sx={{ fontSize: 11, color: 'cockpit.tx3' }}>{g.rows.length} {g.rows.length === 1 ? 'TXN' : 'TXNS'}</Mono>
                          <Box sx={{ flexGrow: 1 }} />
                          <Mono sx={{ fontSize: 11.5, fontWeight: 600, color: dayTotal > 0 ? 'cockpit.pos' : 'cockpit.tx2' }}>{signedAmount(dayTotal)}</Mono>
                        </Stack>
                      </Box>
                    </tr>
                    {g.rows.map((r) => {
                      const i = rows.indexOf(r);
                      const { name, detail } = txnName(r);
                      const extra = [detail, r.note].filter(Boolean).join(' · ');
                      const active = r.id === inspectId;
                      const isCursor = i === cursor;
                      return (
                        <Box component="tr" key={r.id} ref={(el) => { if (el) rowRefs.current.set(r.id, el); else rowRefs.current.delete(r.id); }}
                          onClick={() => inspectAt(i)} aria-selected={active}
                          sx={{ cursor: 'pointer', '& > td': { bgcolor: active ? 'cockpit.hatch' : selected.has(r.id) ? 'cockpit.panel2' : 'transparent' }, '&:hover > td': { bgcolor: 'cockpit.panel2' }, '& > td:first-of-type': { boxShadow: active || isCursor ? (t) => `inset 2px 0 0 ${isCursor ? t.palette.primary.main : t.palette.cockpit.line2}` : 'none' } }}>
                          <Box component="td" sx={{ ...td, ...hideXs }} onClick={(e) => e.stopPropagation()}>
                            <Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} slotProps={{ input: { 'aria-label': `Select ${name}` } }} sx={{ p: 0 }} />
                          </Box>
                          <Box component="td" sx={{ ...td, ...hideXs, ...monoSx, fontSize: 12.5, color: 'cockpit.tx3' }}>{formatTime(r.txn_at) || '—'}</Box>
                          <Box component="td" sx={td} title={[name, extra].filter(Boolean).join(' · ')}>
                            <Box component="span" sx={{ fontWeight: 600, ...(r.merchant_name ? {} : { ...monoSx, fontSize: 12.5, color: 'cockpit.tx2' }) }}>{name}</Box>
                            {extra && <Mono sx={{ fontSize: 11.5, color: 'cockpit.tx3', ml: 1, display: { xs: 'none', sm: 'inline' } }}>{extra}</Mono>}
                          </Box>
                          <Box component="td" sx={{ ...td, ...hideSm, fontSize: 12.5, color: 'cockpit.tx2' }}>{txnTypeLabel(r.txn_type)}</Box>
                          <Box component="td" sx={td}><CategoryTag categoryId={r.category_id} name={r.category} color={r.color} /></Box>
                          <Box component="td" sx={{ ...td, ...hideSm, ...monoSx, fontSize: 11, color: 'cockpit.tx3' }}>{sourceShort(r.source)}</Box>
                          <Box component="td" sx={{ ...td, ...monoSx, fontSize: 13, fontWeight: 600, textAlign: 'right', color: r.direction === 'credit' ? 'cockpit.pos' : 'cockpit.tx' }}>{signedAmount(r.signed_amount)}</Box>
                        </Box>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </Box>
          <Mono component="div" sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.5, px: 1.25, py: 0.75, fontSize: 11, color: 'cockpit.tx3', borderTop: 1, borderColor: 'cockpit.line' }}>
            <span>{selected.size ? `${selected.size} selected` : 'Click a row to inspect'}</span>
            <Box sx={{ flexGrow: 1 }} />
            <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
            <span><Kbd>X</Kbd> select</span>
            <span><Kbd>C</Kbd> categorise</span>
            <span><Kbd>⏎</Kbd> inspect</span>
            <span><Kbd>/</Kbd> search</span>
          </Mono>
        </Box>
      </Box>
      {wide && inspected && (
        <Box sx={{ position: 'sticky', top: TOP_BAR + 8, maxHeight: `calc(100vh - ${TOP_BAR + 40}px)`, overflow: 'auto', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
          <Inspector {...inspectorProps} />
        </Box>
      )}
      {!wide && (
        <Drawer anchor="right" open={!!inspected} onClose={() => setInspectId(null)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: INSPECTOR_WIDTH + 40 }, bgcolor: 'cockpit.panel' } } }}>
          {inspected && <Inspector {...inspectorProps} />}
        </Drawer>
      )}
    </Box>
  );
}

export function TransactionList() {
  const { data: months, isPending } = useMonths();
  if (isPending) return <Loading />;
  return (
    <List
      title="Transactions"
      resource="transactions"
      actions={false}
      component="div"
      filterDefaultValues={months?.[0] ? { month: months[0].month } : {}}
      sort={{ field: 'txn_date', order: 'DESC' }}
      perPage={100}
      exporter={false}
      empty={false}
      pagination={<Pagination rowsPerPageOptions={[50, 100, 250, 500]} sx={{ '& .MuiTablePagination-toolbar': { minHeight: 44 }, '& .MuiIconButton-root': { p: { xs: '10px', md: '6px' } } }} />}
      sx={{ '& .RaList-main': { mt: 0 } }}
    >
      <Ledger />
    </List>
  );
}
