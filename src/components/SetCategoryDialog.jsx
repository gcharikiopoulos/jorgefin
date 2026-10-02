import { Fragment, useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { formatDate, formatTime, signedMoney, sourceLabel, txnName, txnTypeLabel } from '../format.js';
import { useRefreshAfterWrite } from '../hooks.js';

// Manual override for one transaction, through fin_set_category.
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

  useEffect(() => {
    setCategoryId(transaction?.category_id ?? null);
    setNote(transaction?.note ?? '');
    setError('');
  }, [transaction]);

  if (!transaction) return null;
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
      notify('Category updated', { type: 'success' });
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
            <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.25, m: 0, mt: 1, fontSize: 13, '& dt': { color: 'text.secondary' }, '& dd': { m: 0 } }}>
              {facts.map(([label, value]) => (
                <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>
              ))}
            </Box>
          </Box>
          <CategorySelect value={categoryId} onChange={setCategoryId} autoFocus />
          <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} fullWidth />
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
