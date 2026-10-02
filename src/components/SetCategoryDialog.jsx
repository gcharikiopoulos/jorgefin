import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { formatDate, signedMoney } from '../format.js';
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
            <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{transaction.merchant_name || transaction.description}</Typography>
            {transaction.merchant_name && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{transaction.description}</Typography>}
            <Typography variant="body2" color="text.secondary">{formatDate(transaction.txn_date)} · {signedMoney(transaction.signed_amount)}</Typography>
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
