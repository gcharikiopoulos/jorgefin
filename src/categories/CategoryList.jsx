import { Box, Chip, useTheme } from '@mui/material';
import { Datagrid, FunctionField, List, NumberField } from 'react-admin';
import { categoryColor } from '../format.js';
import { useCategories } from '../hooks.js';

export function CategoryList() {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  return (
    <List title="Categories" sx={{ maxWidth: 1200 }} sort={{ field: 'sort_order', order: 'ASC' }} perPage={100} pagination={false} exporter={false}>
      <Datagrid size="small" bulkActionButtons={false} rowClick={false}>
        <FunctionField label="Category" sortBy="name" render={(c) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '4px', bgcolor: categoryColor(c.id, categories, theme.palette.mode, c.color) }} />
            {c.name}
          </Box>
        )} />
        <FunctionField label="Kind" sortBy="kind" render={(c) => <Chip size="small" variant="outlined" label={c.kind} />} />
        <NumberField source="sort_order" label="Order" />
      </Datagrid>
    </List>
  );
}
