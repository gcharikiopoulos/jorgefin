import { useEffect, useState } from 'react';
import { Alert, Box, Button, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import { useDataProvider, useNotify } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { PanelHeader, PanelTransactions } from './SidePanel.jsx';
import { signedMoney } from '../format.js';
import { useRefreshAfterWrite } from '../hooks.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Side panel for a review-queue group: creates a rule through fin_categorize
// (top) and lists the transactions that rule would categorise (below).
export function CategorizePanel({ item, onClose, onSaved }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefreshAfterWrite();
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
      onSaved?.(item);
      refresh();
    } catch (err) {
      console.error(err);
      setError(navigator.onLine ? 'Could not save. Please try again.' : 'You are offline.');
    } finally {
      setSaving(false);
    }
  };

  // The rule matches on the description only (either direction) and leaves
  // transactions categorised by hand alone.
  const filter = matchType === 'prefix' ? { description_prefix: item.description_norm } : { description_norm: item.description_norm };

  return (
    <>
      <PanelHeader
        title={item.sample_description || item.description_norm}
        subtitle={[
          plural(Number(item.txn_count), 'uncategorised transaction'),
          Number(item.debit_count) && Number(item.credit_count) ? `${item.debit_count} out, ${item.credit_count} in` : '',
          `net ${signedMoney(item.net_amount)}`,
        ].filter(Boolean).join(' · ')}
        onClose={onClose}
      />
      <Box component="form" onSubmit={save} sx={{ px: 2, pb: 2 }}>
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Pattern: {item.description_norm}</Typography>
          <CategorySelect value={categoryId} onChange={setCategoryId} autoFocus />
          <TextField label="Merchant name (optional)" placeholder="e.g. Corner shop" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} fullWidth />
          <FormControl>
            <FormLabel sx={{ fontSize: 13 }}>Match</FormLabel>
            <RadioGroup value={matchType} onChange={(e) => setMatchType(e.target.value)}>
              <FormControlLabel value="exact" control={<Radio size="small" />} label="Exact description" />
              <FormControlLabel value="prefix" control={<Radio size="small" />} label="Descriptions starting with this pattern" />
            </RadioGroup>
          </FormControl>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>Apply</Button>
          </Stack>
        </Stack>
      </Box>
      <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>Transactions this rule applies to</Typography>
      <PanelTransactions
        key={`${item.id}|${matchType}`}
        filter={filter}
        note={(r) => (r.category_source === 'manual' ? 'Set by hand · keeps its category' : '')}
      />
    </>
  );
}
