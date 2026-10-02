import { Box, useTheme } from '@mui/material';
import { useCategories } from '../hooks.js';
import { categoryColor } from '../format.js';

// Category tag for dense rows; uncategorised rows get a dashed amber "Assign…".
export function CategoryTag({ categoryId, name, color, sx }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  const unc = categoryId == null;
  const dot = unc ? null : categoryColor(categoryId, categories, theme.palette.mode, color);
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625, maxWidth: '100%', height: 16, px: 0.75, borderRadius: '2px', fontSize: 12, fontWeight: 500, border: 1, borderStyle: unc ? 'dashed' : 'solid', borderColor: unc ? 'cockpit.warn' : 'cockpit.line', color: unc ? 'cockpit.warn' : 'cockpit.tx2', bgcolor: unc ? 'cockpit.warnBg' : 'cockpit.panel2', ...sx }}>
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: '1px', flex: 'none', bgcolor: dot, border: unc ? 1 : 0, borderStyle: 'dashed', borderColor: 'cockpit.warn' }} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unc ? 'Assign…' : name || 'Unknown'}</Box>
    </Box>
  );
}
