import { Box, useTheme } from '@mui/material';
import { useCategories } from '../hooks.js';
import { categoryColor } from '../format.js';

// Category tag for dense rows; uncategorised rows get a amber "Assign…".
export function CategoryTag({ categoryId, name, color, sx, wrap = false }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  const unc = categoryId == null;
  const dot = unc ? null : categoryColor(categoryId, categories, theme.palette.mode, color);
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, maxWidth: '100%', minHeight: 24, height: wrap ? 'auto' : 24, py: wrap ? 0.25 : 0, px: 1, lineHeight: 1.3, borderRadius: '6px', fontSize: 13, fontWeight: 500, color: unc ? 'cockpit.warn' : 'cockpit.tx2', bgcolor: unc ? 'cockpit.warnBg' : 'cockpit.panel2', ...sx }}>
      <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', flex: 'none', bgcolor: unc ? 'cockpit.warn' : dot }} />
      <Box component="span" sx={wrap ? { whiteSpace: 'normal', overflowWrap: 'normal' } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unc ? 'Assign…' : name || 'Unknown'}</Box>
    </Box>
  );
}
