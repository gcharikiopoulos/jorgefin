// "Starts with" pattern input for prefix rules, with a live count of the
// transactions the pattern would match (same normalisation as the database).

import { useEffect, useState } from 'react';
import { Box, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDataProvider } from 'react-admin';
import { Mono } from '../dashboard/parts.jsx';
import { normalizeText } from '../format.js';
import { monoSx } from '../theme.js';
import { CONTROL } from './dense.js';

export const MIN_PREFIX = 3;

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// How many transactions start with the pattern, and how many of those were set by hand.
export function usePrefixMatches(prefix) {
  const dataProvider = useDataProvider();
  const norm = normalizeText(useDebounced(prefix));
  return useQuery({
    queryKey: ['prefix-matches', norm],
    enabled: norm.length >= MIN_PREFIX,
    queryFn: async () => {
      const count = async (filter) => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 1 }, sort: { field: 'id', order: 'ASC' }, filter: { description_prefix: norm, ...filter } })).total;
      const [all, manual] = await Promise.all([count({}), count({ category_source: 'manual' })]);
      return { norm, all, manual };
    },
  });
}

// Small segmented switch: options are [value, label] pairs.
export function Segments({ value, onChange, options, label, fullWidth }) {
  return (
    <Box role="group" aria-label={label} sx={{ display: fullWidth ? 'grid' : 'inline-grid', gridTemplateColumns: `repeat(${options.length}, ${fullWidth ? 'minmax(0, 1fr)' : 'auto'})`, border: 1, borderColor: 'cockpit.line2', borderRadius: '8px', overflow: 'hidden' }}>
      {options.map(([v, text], i) => (
        <Box key={v} component="button" type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          sx={{ minHeight: CONTROL, whiteSpace: 'nowrap', border: 0, borderLeft: i ? 1 : 0, borderColor: 'cockpit.line2', px: fullWidth ? 0.5 : 1.25, font: 'inherit', fontSize: fullWidth ? 13 : 14, fontWeight: value === v ? 600 : 400, cursor: 'pointer', bgcolor: value === v ? 'primary.main' : 'cockpit.panel', color: value === v ? '#fff' : 'cockpit.tx2' }}>
          {text}
        </Box>
      ))}
    </Box>
  );
}

export function PrefixField({ value, onChange, description, autoFocus }) {
  const matches = usePrefixMatches(value);
  const norm = normalizeText(value);
  const tooShort = norm.length < MIN_PREFIX;
  const coversThis = !description || normalizeText(description).startsWith(norm);
  const m = matches.data?.norm === norm ? matches.data : null;
  return (
    <Box>
      <TextField
        label="Starts with"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        fullWidth
        error={!tooShort && !coversThis}
        slotProps={{ htmlInput: { maxLength: 80, autoCapitalize: 'characters', spellCheck: false, style: { ...monoSx, textTransform: 'uppercase' } } }}
        helperText={tooShort ? `At least ${MIN_PREFIX} characters.` : !coversThis ? 'This transaction’s description does not start with it.' : null}
      />
      {!tooShort && (
        <Mono component="div" sx={{ fontSize: 13, color: 'cockpit.tx3', mt: 0.75, '& b': { color: 'cockpit.tx', fontWeight: 600 } }}>
          {m ? (
            <>
              Matches <b>{m.all}</b> {m.all === 1 ? 'transaction' : 'transactions'}
              {m.manual > 0 && <> · {m.manual} set by hand keep theirs</>}
            </>
          ) : 'Counting…'}
        </Mono>
      )}
    </Box>
  );
}
