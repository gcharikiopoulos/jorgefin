// Split one payment across categories (db/010_splits.sql). The lines take part of
// the amount; whatever they leave stays in the transaction's own category, so a
// 1.000 € withdrawal split 300 € groceries + 200 € kiosk keeps 500 € as cash.

import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { CategorySelect } from './CategorySelect.jsx';
import { CategoryTag } from './CategoryTag.jsx';
import { amount } from '../format.js';
import { useRefreshAfterWrite } from '../hooks.js';
import { num } from '../backend.js';

const parse = (s) => {
  const v = Number(String(s ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
};
const blank = () => ({ category_id: null, amount: '', note: '' });

export function useSplits(txnId, enabled = true) {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['splits', txnId], queryFn: () => dataProvider.getSplits(txnId), enabled: enabled && txnId != null });
}

export function SplitEditor({ transaction: t, startOpen = false }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const refreshQueries = useRefreshAfterWrite();
  const query = useSplits(t.id);
  const saved = query.data || [];
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A different transaction, or splits loaded: start from what is saved.
  useEffect(() => {
    setLines(saved.map((s) => ({ category_id: s.category_id, amount: amount(s.amount), note: s.note || '' })));
    setEditing(startOpen && !saved.length);
    setError('');
  }, [t.id, query.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (editing && !lines.length) setLines([blank()]); }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = num(t.amount);
  const used = lines.reduce((s, l) => s + (parse(l.amount) || 0), 0);
  const remaining = Math.round((total - used) * 100) / 100;
  const own = t.category_id == null ? 'Uncategorised' : t.category;
  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async (next) => {
    const clean = next.filter((l) => l.category_id || l.amount);
    for (const l of clean) {
      if (!l.category_id) return setError('Choose a category for every line.');
      if (!(parse(l.amount) > 0)) return setError('Every line needs an amount above zero.');
    }
    if (clean.reduce((s, l) => s + parse(l.amount), 0) > total + 0.001) return setError(`The lines add up to more than ${amount(total)} €.`);
    setSaving(true);
    setError('');
    try {
      await dataProvider.setSplits({ txnId: t.id, lines: clean.map((l) => ({ category_id: l.category_id, amount: parse(l.amount), note: l.note.trim() || null })) });
      notify(clean.length ? `Split into ${clean.length} ${clean.length === 1 ? 'line' : 'lines'}` : 'Split removed', { type: 'success' });
      setEditing(false);
      refreshQueries();
      refresh();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Could not save the split.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    if (!saved.length) {
      return (
        <Button variant="outlined" onClick={() => setEditing(true)} disabled={query.isPending} sx={{ alignSelf: 'flex-start' }}>
          Split this payment
        </Button>
      );
    }
    const left = Math.round((total - saved.reduce((s, l) => s + num(l.amount), 0)) * 100) / 100;
    return (
      <Box sx={{ borderRadius: '12px', p: 2, bgcolor: 'cockpit.panel2' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Split into {saved.length + (left > 0 ? 1 : 0)}</Typography>
          <Button onClick={() => setEditing(true)} sx={{ minHeight: 32 }}>Edit</Button>
        </Stack>
        {saved.map((s) => (
          <Stack key={s.id} direction="row" sx={{ alignItems: 'center', gap: 1, py: 0.5, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <CategoryTag wrap categoryId={s.category_id} name={s.category} />
              {s.note && <Typography sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 0.25 }}>{s.note}</Typography>}
            </Box>
            <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{amount(s.amount)}</Typography>
          </Stack>
        ))}
        {left > 0 && (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, py: 0.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><CategoryTag wrap categoryId={t.category_id} name={own} /><Typography sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 0.25 }}>The rest, in the payment's own category</Typography></Box>
            <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{amount(left)}</Typography>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ borderRadius: '12px', p: 2, bgcolor: 'cockpit.panel2', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Split {amount(total)} €</Typography>
        <Typography sx={{ fontSize: 13, color: 'cockpit.tx3' }}>Whatever the lines don't cover stays in {own}.</Typography>
      </Box>
      {lines.map((l, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px', gap: 1, alignItems: 'center' }}>
          <CategorySelect value={l.category_id} onChange={(v) => setLine(i, { category_id: v })} label={`Line ${i + 1}`} size="small" />
          <IconButton aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><DeleteIcon sx={{ fontSize: 20 }} /></IconButton>
          <Stack direction="row" sx={{ gap: 1, minWidth: 0 }}>
            <TextField size="small" label="€" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })}
              slotProps={{ htmlInput: { inputMode: 'decimal', style: { textAlign: 'right' } } }} sx={{ m: 0, width: 112, flexShrink: 0 }} />
            <TextField size="small" label="Note" value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ m: 0, flex: 1, minWidth: 0 }} />
          </Stack>
        </Box>
      ))}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={() => setLines((ls) => [...ls, blank()])}>+ Add line</Button>
        {remaining > 0 && lines.some((l) => !l.amount) && (
          <Button onClick={() => { const i = lines.findIndex((l) => !l.amount); setLine(i, { amount: amount(remaining) }); }}>Fill in the rest ({amount(remaining)})</Button>
        )}
      </Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', fontSize: 14, color: remaining < 0 ? 'cockpit.neg' : 'cockpit.tx2' }}>
        <span>{remaining < 0 ? 'Over the payment by' : `Stays in ${own}`}</span>
        <Box component="span" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{amount(Math.abs(remaining))} €</Box>
      </Stack>
      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={() => save(lines)} disabled={saving || remaining < 0}>Save split</Button>
        <Button onClick={() => { setLines(saved.map((s) => ({ category_id: s.category_id, amount: amount(s.amount), note: s.note || '' }))); setEditing(false); setError(''); }} disabled={saving}>Cancel</Button>
        {saved.length > 0 && <Button color="error" onClick={() => save([])} disabled={saving} sx={{ ml: 'auto' }}>Remove split</Button>}
      </Stack>
    </Box>
  );
}
