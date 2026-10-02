import { Typography } from '@mui/material';
import { signedMoney } from '../format.js';
import { num } from '../backend.js';

// Signed amount; credits in the success colour.
export function Amount({ value, credit, variant = 'body2', sx }) {
  const isCredit = credit ?? num(value) > 0;
  return (
    <Typography component="span" variant={variant} sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: isCredit ? 'success.main' : 'text.primary', ...sx }}>
      {signedMoney(value)}
    </Typography>
  );
}
