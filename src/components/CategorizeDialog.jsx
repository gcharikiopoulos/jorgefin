import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import { useDataProvider, useNotify, useRefresh } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { money } from '../format.js';
import { useRefreshAfterWrite } from '../hooks.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Creates a rule for a review-queue group and applies it, through fin_categorize.
export function CategorizeDialog({ item, onClose }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const refreshQueries = useRefreshAfterWrite();
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const [categoryId, setCategoryId] = useState(null);
  const [merchantName, setMerchantName] = useState('');
  const [matchType, setMatchType] = useState('exact');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCategoryId(null);
    setMerchantName('');
    setMatchType('exact');
    setError('');
  }, [item]);

  if (!item) return null;

  const save = async (event) => {
    event.preventDefault();
    if (!categoryId) return setError('Choose a category.');
    setSaving(true);
    setError('');
    try {
      const updated = await dataProvider.categorize({
        pattern: item.description_norm,
        categoryId,
        merchantName: merchantName.trim() || null,
        matchType,
      });
      notify(`Updated ${plural(updated, 'transaction')}`, { type: 'success' });
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
      <DialogTitle>Categorise</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.sample_description || item.description_norm}</Typography>
            <Typography variant="body2" color="text.secondary">{plural(Number(item.txn_count), 'transaction')} · {money(item.total_amount)}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Pattern: {item.description_norm}</Typography>
          </Box>
          <CategorySelect value={categoryId} onChange={setCategoryId} autoFocus />
          <TextField label="Merchant name (optional)" placeholder="e.g. Corner shop" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} fullWidth />
          <FormControl>
            <FormLabel>Match</FormLabel>
            <RadioGroup value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <FormControlLabel value="exact" control={<Radio />} label="Exact description" />
              <FormControlLabel value="prefix" control={<Radio />} label="Descriptions starting with this pattern" />
            </RadioGroup>
          </FormControl>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
