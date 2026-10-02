import { Fragment, useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { formatDate, formatTime, signedMoney, sourceLabel, txnName, txnTypeLabel } from '../format.js';
import { useRefreshAfterWrite } from '../hooks.js';

// How many other transactions share this one's description, and how many of those
// were categorised by hand (a rule leaves those alone).
export function useIdentical(transaction) {
  const dataProvider = useDataProvider();
  const norm = transaction?.description_norm;
  return useQuery({
    queryKey: ['identical', norm],
    enabled: !!norm,
    queryFn: async () => {
      const count = async (filter) => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { description_norm: norm, ...filter } })).total;
      const [all, manual] = await Promise.all([count({}), count({ category_source: 'manual' })]);
      const selfManual = transaction.category_source === 'manual' ? 1 : 0;
      return { others: Math.max(0, all - 1), manualOthers: Math.max(0, manual - selfManual) };
    },
  });
}

// Manual override for one transaction, through fin_set_category. Optionally also
// creates an exact-match rule (fin_categorize) for every transaction with the same
// description, now and in future imports.
export function SetCategoryDialog({ transaction, onClose }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const refreshQueries = useRefreshAfterWrite();
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [categoryId, setCategoryId] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [applyAll, setApplyAll] = useState(false);
  const identical = useIdentical(transaction);

  useEffect(() => {
    setCategoryId(transaction?.category_id ?? null);
    setNote(transaction?.note ?? '');
    setError('');
    setApplyAll(false);
  }, [transaction]);

  if (!transaction) return null;
  const others = identical.data?.others ?? 0;
  const manualOthers = identical.data?.manualOthers ?? 0;
  const { name, detail } = txnName(transaction);
  const t = transaction;
  const facts = [
    ['Date', [formatDate(t.txn_date), formatTime(t.txn_at)].filter(Boolean).join(' ')],
    t.posting_date && t.posting_date !== t.txn_date && ['Posted', formatDate(t.posting_date)],
    t.value_date && t.value_date !== t.txn_date && ['Value date', formatDate(t.value_date)],
    txnTypeLabel(t.txn_type) && ['Type', txnTypeLabel(t.txn_type)],
    t.source && ['Source', sourceLabel(t.source)],
    t.category_source && ['Category set by', t.category_source === 'rule' ? 'Rule' : 'You'],
  ].filter(Boolean);

  const save = async (event) => {
    event.preventDefault();
    if (!categoryId) return setError('Choose a category.');
    setSaving(true);
    setError('');
    try {
      await dataProvider.setCategory({ txnId: transaction.id, categoryId, note: note.trim() || null });
      if (applyAll && others > 0) {
        const updated = await dataProvider.categorize({ pattern: transaction.description_norm, categoryId, matchType: 'exact' });
        notify(`Category set on this and ${updated} other ${updated === 1 ? 'transaction' : 'transactions'}`, { type: 'success' });
      } else {
        notify('Category updated', { type: 'success' });
      }
      refreshQueries();
      refresh();
      onClose();
    } catch (err) {
      console.error(err);
      setError(navigator.onLine ? 'Could not save. Please try again.' : 'You are offline.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen} component="form" onSubmit={save}>
      <DialogTitle>Change category</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</Typography>
              <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{signedMoney(transaction.signed_amount)}</Typography>
            </Stack>
            {detail && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{detail}</Typography>}
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, m: 0, mt: 1, fontSize: 14.5, '& dt': { color: 'text.secondary' }, '& dd': { m: 0 } }}>
              {facts.map(([label, value]) => (
                <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>
              ))}
            </Box>
          </Box>
          <CategorySelect value={categoryId} onChange={setCategoryId} autoFocus />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
          {others > 0 && (
            <Box>
              <FormControlLabel
                control={<Checkbox checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />}
                label={`Also apply to the ${others} other ${others === 1 ? 'transaction' : 'transactions'} with this description, and to future ones`}
                sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.25 } }}
              />
              {applyAll && manualOthers > 0 && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ pl: 4 }}>
                  {manualOthers} of them you categorised by hand; those keep their category.
                </Typography>
              )}
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
