import { Box, Chip, alpha, useTheme } from '@mui/material';
import { useCategories } from '../hooks.js';
import { categoryColor } from '../format.js';

// Category name with a colour dot. Uncategorised rows get a warning chip.
export function CategoryChip({ categoryId, name, color, size = 'small' }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  if (categoryId == null) {
    return <Chip size={size} label="Uncategorised" variant="outlined" sx={{ color: 'warning.dark', borderColor: 'warning.main', bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(237,161,0,0.12)' : 'rgba(237,161,0,0.10)') }} />;
  }
  const dot = categoryColor(categoryId, categories, theme.palette.mode, color);
  return (
    <Chip
      size={size}
      variant="outlined"
      label={name || 'Unknown'}
      icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot, ml: '8px !important' }} />}
      sx={{ maxWidth: '100%', borderColor: alpha(dot, 0.45), bgcolor: alpha(dot, theme.palette.mode === 'dark' ? 0.16 : 0.08) }}
    />
  );
}
