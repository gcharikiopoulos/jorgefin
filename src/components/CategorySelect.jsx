import { Box, ListSubheader, MenuItem, TextField, useTheme } from '@mui/material';
import { useCategories } from '../hooks.js';
import { categoryColor, categoryLabel, categoryTree } from '../format.js';

const KINDS = [['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];

export function CategoryDot({ color, size = 10 }) {
  return <Box component="span" sx={{ width: size, height: size, borderRadius: '50%', bgcolor: color, flex: 'none', display: 'inline-block' }} />;
}

// Category picker grouped by kind, with colour dots; subcategories are indented
// under their parent. `exclude` hides the given ids.
export function CategorySelect({ value, onChange, label = 'Category', exclude = [], ...props }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  const hidden = new Set(exclude);
  const option = (c, child) => (
    <MenuItem key={c.id} value={c.id} sx={{ gap: 1, pl: child ? 4.5 : 2 }}>
      <CategoryDot color={categoryColor(c.id, categories, theme.palette.mode)} size={child ? 8 : 10} />
      {c.name}
    </MenuItem>
  );
  const items = [];
  for (const [kind, title] of KINDS) {
    const tree = categoryTree(categories, kind);
    if (!tree.length) continue;
    items.push(<ListSubheader key={`h-${kind}`}>{title}</ListSubheader>);
    for (const parent of tree) {
      if (!hidden.has(parent.id)) items.push(option(parent, false));
      for (const child of parent.children) if (!hidden.has(child.id)) items.push(option(child, true));
    }
  }
  const selected = categories.find((c) => c.id === value);
  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      slotProps={{
        select: {
          renderValue: () => (selected ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <CategoryDot color={categoryColor(selected.id, categories, theme.palette.mode)} />
              {categoryLabel(selected, categories)}
            </Box>
          ) : ''),
        },
      }}
      {...props}
    >
      {items}
    </TextField>
  );
}
