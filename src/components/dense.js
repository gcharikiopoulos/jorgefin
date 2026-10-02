// Shared styles for the dense cockpit tables.

import { monoSx } from '../theme.js';

export const thSx = { ...monoSx, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'cockpit.tx3', textAlign: 'left', px: 0.875, height: 24, borderBottom: 1, borderColor: 'cockpit.line2', whiteSpace: 'nowrap', bgcolor: 'cockpit.panel' };
export const tdSx = { px: 0.875, height: 26, borderBottom: 1, borderColor: 'cockpit.line', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 0 };
export const tableSx = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' };
export const hideBelowMd = { display: { xs: 'none', md: 'table-cell' } };
export const hideBelowSm = { display: { xs: 'none', sm: 'table-cell' } };

// Rows that react to hover, selection and the keyboard cursor.
export const rowSx = ({ active, cursor } = {}) => ({
  cursor: 'pointer',
  '& > td': { bgcolor: active ? 'cockpit.hatch' : 'transparent' },
  '&:hover > td': { bgcolor: 'cockpit.panel2' },
  '& > td:first-of-type': { boxShadow: active || cursor ? (t) => `inset 2px 0 0 ${cursor ? t.palette.primary.main : t.palette.cockpit.line2}` : 'none' },
});

export const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || !!e.target.closest?.('[role="listbox"], [role="dialog"]');
