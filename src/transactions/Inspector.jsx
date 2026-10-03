// Right-hand inspector for one transaction: facts, category form (optionally a rule
// for every transaction with the same description) and that description's history.

import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { CategorySelect } from '../components/CategorySelect.jsx';
import { CategoryTag } from '../components/CategoryTag.jsx';
import { useIdentical } from '../components/SetCategoryDialog.jsx';
import { Label, Mono } from '../dashboard/parts.jsx';
import { amount, formatDate, formatShortMonth, formatTime, normalizeText, parseDate, signedAmount, sourceLabel, suggestPrefix, txnName, txnTypeLabel } from '../format.js';
import { MIN_PREFIX, PrefixField, Segments } from '../components/PrefixField.jsx';
import { useRefreshAfterWrite } from '../hooks.js';
import { num } from '../backend.js';

const weekday = new Intl.DateTimeFormat('el-GR', { weekday: 'short' });

// Every transaction with this description: monthly totals for the last six months.
function useHistory(transaction) {
  const dataProvider = useDataProvider();
  const norm = transaction?.description_norm;
  return useQuery({
    queryKey: ['description-history', norm],
    enabled: !!norm,
    queryFn: async () => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 500 }, sort: { field: 'txn_date', order: 'DESC' }, filter: { description_norm: norm } })).data,
  });
}

function History({ transaction }) {
  const query = useHistory(transaction);
  if (!query.data) return null;
  const rows = query.data;
  const end = parseDate(transaction.txn_date);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - 5 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const totals = months.map((m) => rows.filter((r) => r.txn_date.slice(0, 7) === m.slice(0, 7)).reduce((s, r) => s + Math.abs(num(r.signed_amount)), 0));
  const max = Math.max(...totals, 1);
  const first = rows[rows.length - 1];
  const avg = rows.reduce((s, r) => s + Math.abs(num(r.signed_amount)), 0) / rows.length;
  return (
    <Box>
      <Label component="div" sx={{ mb: 0.625 }}>Same description · history</Label>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 34, borderBottom: 1, borderColor: 'cockpit.line2' }} aria-hidden>
        {totals.map((v, i) => <Box key={months[i]} title={`${formatShortMonth(months[i])} · ${amount(v)} €`} sx={{ flex: '1 1 0', height: `${(v / max) * 100}%`, borderRadius: '3px 3px 0 0', bgcolor: i === 5 ? 'primary.main' : 'cockpit.line2' }} />)}
      </Box>
      <Mono sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'cockpit.tx3', mt: '3px' }}>
        {months.map((m) => <span key={m}>{formatShortMonth(m)}</span>)}
      </Mono>
      <Mono component="div" sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 0.75, '& b': { color: 'cockpit.tx', fontWeight: 600 } }}>
        <b>{rows.length}</b> {rows.length === 1 ? 'time' : 'times'} · avg <b>{amount(avg)}</b> · first <b>{formatDate(first.txn_date)}</b>
      </Mono>
    </Box>
  );
}

function Fact({ k, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', columnGap: 1, alignItems: 'baseline', py: 0.875, borderBottom: 1, borderColor: 'cockpit.line' }}>
      <Label>{k}</Label>
      <Box sx={{ fontSize: 14, minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Box>
  );
}

export function Inspector({ transaction: t, onClose, onPrev, onNext }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const refreshQueries = useRefreshAfterWrite();
  const identical = useIdentical(t);
  const [categoryId, setCategoryId] = useState(null);
  const [note, setNote] = useState('');
  const [scope, setScope] = useState('one'); // one | same | prefix
  const [prefix, setPrefix] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCategoryId(t?.category_id ?? null);
    setNote(t?.note ?? '');
    setScope('one');
    setPrefix(suggestPrefix(t?.description_norm));
    setError('');
  }, [t]);

  if (!t) return null;
  const { name, detail } = txnName(t);
  const unc = t.category_id == null;
  const others = identical.data?.others ?? 0;
  const manualOthers = identical.data?.manualOthers ?? 0;
  const credit = t.direction === 'credit';
  const date = parseDate(t.txn_date);

  const save = async (event) => {
    event.preventDefault();
    if (!categoryId) return setError('Choose a category.');
    const prefixNorm = normalizeText(prefix);
    if (scope === 'prefix' && prefixNorm.length < MIN_PREFIX) return setError(`The pattern needs at least ${MIN_PREFIX} characters.`);
    setSaving(true);
    setError('');
    try {
      await dataProvider.setCategory({ txnId: t.id, categoryId, note: note.trim() || null });
      if (scope === 'same' && others > 0) {
        const updated = await dataProvider.categorize({ pattern: t.description_norm, categoryId, matchType: 'exact' });
        notify(`Category set on this and ${updated} other ${updated === 1 ? 'transaction' : 'transactions'}`, { type: 'success' });
      } else if (scope === 'prefix') {
        const updated = await dataProvider.categorize({ pattern: prefixNorm, categoryId, matchType: 'prefix' });
        notify(`Category set on this and ${updated} other ${updated === 1 ? 'transaction' : 'transactions'} starting with "${prefixNorm}"; future ones follow`, { type: 'success' });
      } else {
        notify('Category updated', { type: 'success' });
      }
      refreshQueries();
      refresh();
    } catch (err) {
      console.error(err);
      setError(navigator.onLine ? 'Could not save. Please try again.' : 'You are offline.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="aside" aria-label="Selected transaction" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, bgcolor: 'cockpit.panel', height: '100%' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, height: { xs: 52, md: 40 }, px: 1.5, '& .MuiIconButton-root': { p: { xs: '10px', md: '6px' } }, borderBottom: 1, borderColor: 'cockpit.line', flex: 'none' }}>
        <Box sx={{ fontSize: 15, fontWeight: 600 }}>Transaction</Box>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton aria-label="Previous transaction (K)" onClick={onPrev} disabled={!onPrev}><KeyboardArrowUpIcon sx={{ fontSize: 20 }} /></IconButton>
        <IconButton aria-label="Next transaction (J)" onClick={onNext} disabled={!onNext}><KeyboardArrowDownIcon sx={{ fontSize: 20 }} /></IconButton>
        <IconButton aria-label="Close (Esc)" onClick={onClose}><CloseIcon sx={{ fontSize: 20 }} /></IconButton>
      </Stack>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.75, overflow: 'auto' }}>
        <Box>
          {unc
            ? <Mono component="div" sx={{ fontSize: 13.5, fontWeight: 500, color: 'cockpit.warn' }}>No category yet</Mono>
            : <CategoryTag categoryId={t.category_id} name={t.category} color={t.color} />}
          <Box sx={{ fontSize: 16, fontWeight: 600, mt: 0.75, overflowWrap: 'anywhere', ...(t.merchant_name ? {} : { fontFamily: (th) => th.typography.fontFamily }) }}>{name}</Box>
          {detail && <Mono component="div" sx={{ fontSize: 13, color: 'cockpit.tx3', overflowWrap: 'anywhere' }}>{detail}</Mono>}
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 0.75, mt: 0.5 }}>
            <Mono sx={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em', color: credit ? 'cockpit.pos' : 'cockpit.tx' }}>{signedAmount(t.signed_amount)}</Mono>
            <Mono sx={{ fontSize: 15, color: 'cockpit.tx3' }}>€</Mono>
          </Stack>
        </Box>

        <Box>
          <Fact k="Date"><Mono>{weekday.format(date)} {formatDate(t.txn_date)}{formatTime(t.txn_at) ? ` · ${formatTime(t.txn_at)}` : ''}</Mono></Fact>
          {t.posting_date && t.posting_date !== t.txn_date && <Fact k="Posted"><Mono>{formatDate(t.posting_date)}</Mono></Fact>}
          {t.value_date && t.value_date !== t.txn_date && <Fact k="Value date"><Mono>{formatDate(t.value_date)}</Mono></Fact>}
          {txnTypeLabel(t.txn_type) && <Fact k="Type">{txnTypeLabel(t.txn_type)}</Fact>}
          {t.source && <Fact k="Source">{sourceLabel(t.source)}</Fact>}
          <Fact k="Category by">{t.category_source === 'rule' ? 'Rule' : t.category_source === 'manual' ? 'You' : <Box component="span" sx={{ color: 'cockpit.tx3', fontStyle: 'italic' }}>not set</Box>}</Fact>
          {t.description && <Fact k="Bank text"><Mono sx={{ fontSize: 13, color: 'cockpit.tx2' }}>{t.description}</Mono></Fact>}
        </Box>

        <Box component="form" onSubmit={save} sx={{ borderRadius: '12px', p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, bgcolor: 'cockpit.panel2' }}>
          <Box sx={{ fontSize: 15, fontWeight: 600 }}>Categorise</Box>
          <CategorySelect id="inspector-category" value={categoryId} onChange={setCategoryId} />
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
          <Box>
            <Label component="div" sx={{ mb: 0.5 }}>Apply to</Label>
            <Segments fullWidth label="Apply to" value={scope} onChange={setScope}
              options={[['one', 'This one'], ...(others > 0 ? [['same', `All ${others + 1} same`]] : []), ['prefix', 'Starts with']]} />
            {scope === 'same' && (
              <Mono component="div" sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 0.75 }}>
                Every transaction with exactly this description, now and in future imports.{manualOthers > 0 ? ` ${manualOthers} set by hand keep their category.` : ''}
              </Mono>
            )}
          </Box>
          {scope === 'prefix' && <PrefixField value={prefix} onChange={setPrefix} description={t.description_norm} />}
          {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
          <Button type="submit" variant="contained" disabled={saving} fullWidth>
            {scope === 'same' && others ? `Save + apply to ${others}` : scope === 'prefix' ? 'Save + create rule' : 'Save'}
          </Button>
        </Box>

        <History transaction={t} />
      </Box>
    </Box>
  );
}
