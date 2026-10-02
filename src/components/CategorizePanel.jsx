import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, TextField } from '@mui/material';
import { useDataProvider, useNotify } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { PanelHeader, PanelTransactions } from './SidePanel.jsx';
import { Kbd, Label, Mono } from '../dashboard/parts.jsx';
import { signedAmount } from '../format.js';
import { monoSx } from '../theme.js';
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
        tag="NEW RULE"
        title={item.sample_description || item.description_norm}
        subtitle={[
          plural(Number(item.txn_count), 'txn'),
          Number(item.debit_count) && Number(item.credit_count) ? `${item.debit_count} out · ${item.credit_count} in` : '',
          `net ${signedAmount(item.net_amount)} €`,
        ].filter(Boolean).join(' · ')}
        onClose={onClose}
      />
      <Box component="form" onSubmit={save} sx={{ mx: 1.5, mb: 1.5, p: 1.25, border: 1, borderColor: 'cockpit.line2', borderRadius: '3px', bgcolor: 'cockpit.panel2' }}>
        <Stack spacing={1}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Label sx={{ color: 'cockpit.tx' }}>Categorise</Label>
            <Kbd>C</Kbd>
          </Stack>
          <Box>
            <Label sx={{ fontSize: 9 }}>Pattern</Label>
            <Mono component="div" sx={{ fontSize: 10.5, color: 'cockpit.tx', overflowWrap: 'anywhere', mt: 0.25 }}>{item.description_norm}{matchType === 'prefix' ? '…' : ''}</Mono>
          </Box>
          <CategorySelect id="review-category" value={categoryId} onChange={setCategoryId} />
          <TextField label="Merchant name (optional)" placeholder="e.g. Corner shop" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} fullWidth />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Label sx={{ fontSize: 9 }}>Match</Label>
            <Box role="group" aria-label="Match" sx={{ display: 'inline-flex', border: 1, borderColor: 'cockpit.line2', borderRadius: '3px', overflow: 'hidden', height: 24 }}>
              {[['exact', 'EXACT'], ['prefix', 'STARTS WITH']].map(([v, text], i) => (
                <Box key={v} component="button" type="button" aria-pressed={matchType === v} onClick={() => setMatchType(v)}
                  sx={{ ...monoSx, border: 0, borderLeft: i ? 1 : 0, borderColor: 'cockpit.line2', px: 1, fontSize: 9.5, fontWeight: 600, cursor: 'pointer', bgcolor: matchType === v ? 'primary.main' : 'cockpit.panel', color: matchType === v ? '#fff' : 'cockpit.tx2' }}>
                  {text}
                </Box>
              ))}
            </Box>
          </Stack>
          {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
          <Button type="submit" variant="contained" disabled={saving} fullWidth>Apply rule</Button>
        </Stack>
      </Box>
      <PanelTransactions
        key={`${item.id}|${matchType}`}
        title="This rule applies to"
        filter={filter}
        note={(r) => (r.category_source === 'manual' ? 'set by hand · keeps its category' : '')}
      />
    </>
  );
}
