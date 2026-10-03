import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, TextField } from '@mui/material';
import { useDataProvider, useNotify } from 'react-admin';
import { CategorySelect } from './CategorySelect.jsx';
import { PanelHeader, PanelTransactions } from './SidePanel.jsx';
import { Label, Mono } from '../dashboard/parts.jsx';
import { normalizeText, signedAmount, suggestPrefix } from '../format.js';
import { MIN_PREFIX, PrefixField, Segments, useDebounced } from './PrefixField.jsx';
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
  const [prefix, setPrefix] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Descriptions that end in a reference code (SPOTIFY P36DD67B53) start on
  // "starts with" the leading words, so one rule catches every month's charge.
  useEffect(() => {
    const suggestion = suggestPrefix(item.description_norm);
    setCategoryId(null);
    setMerchantName('');
    setPrefix(suggestion);
    setMatchType(suggestion.length >= MIN_PREFIX && suggestion !== normalizeText(item.description_norm) ? 'prefix' : 'exact');
    setError('');
  }, [item]);
  const prefixNorm = normalizeText(prefix);
  const previewPrefix = normalizeText(useDebounced(prefix));

  const save = async (event) => {
    event.preventDefault();
    if (!categoryId) return setError('Choose a category.');
    if (matchType === 'prefix' && prefixNorm.length < MIN_PREFIX) return setError(`The pattern needs at least ${MIN_PREFIX} characters.`);
    setSaving(true);
    setError('');
    try {
      const updated = await dataProvider.categorize({
        pattern: matchType === 'prefix' ? prefixNorm : item.description_norm,
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
  const filter = matchType === 'prefix' ? { description_prefix: previewPrefix.length >= MIN_PREFIX ? previewPrefix : item.description_norm } : { description_norm: item.description_norm };

  return (
    <>
      <PanelHeader
        tag="New rule"
        title={item.sample_description || item.description_norm}
        subtitle={[
          plural(Number(item.txn_count), 'transaction'),
          Number(item.debit_count) && Number(item.credit_count) ? `${item.debit_count} out · ${item.credit_count} in` : '',
          `net ${signedAmount(item.net_amount)} €`,
        ].filter(Boolean).join(' · ')}
        onClose={onClose}
      />
      <Box component="form" onSubmit={save} sx={{ mx: 1.5, mb: 1.5, p: 2, borderRadius: '12px', bgcolor: 'cockpit.panel2' }}>
        <Stack spacing={1.5}>
          <Box sx={{ fontSize: 15, fontWeight: 600 }}>Categorise</Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Label>Match</Label>
            <Segments label="Match" value={matchType} onChange={setMatchType} options={[['exact', 'Exact text'], ['prefix', 'Starts with']]} />
          </Stack>
          {matchType === 'prefix'
            ? <PrefixField value={prefix} onChange={setPrefix} description={item.description_norm} />
            : (
              <Box>
                <Label>Pattern</Label>
                <Mono component="div" sx={{ fontSize: 13.5, color: 'cockpit.tx', overflowWrap: 'anywhere', mt: 0.25 }}>{item.description_norm}</Mono>
              </Box>
            )}
          <CategorySelect id="review-category" value={categoryId} onChange={setCategoryId} />
          <TextField label="Merchant name (optional)" placeholder="e.g. Corner shop" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} fullWidth />
          {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
          <Button type="submit" variant="contained" disabled={saving} fullWidth>Apply rule</Button>
        </Stack>
      </Box>
      <PanelTransactions
        key={`${item.id}|${matchType}|${previewPrefix}`}
        title="This rule applies to"
        filter={filter}
        note={(r) => (r.category_source === 'manual' ? 'set by hand · keeps its category' : '')}
      />
    </>
  );
}
