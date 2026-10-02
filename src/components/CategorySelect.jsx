import { ListSubheader, MenuItem, TextField } from '@mui/material';
import { useCategories } from '../hooks.js';

const KINDS = [['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];

// Category picker grouped by kind; children show as "Parent › Child".
export function CategorySelect({ value, onChange, label = 'Category', ...props }) {
  const { data: categories = [] } = useCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const labelFor = (c) => (c.parent_id != null && byId.get(c.parent_id) ? `${byId.get(c.parent_id).name} › ${c.name}` : c.name);
  const items = [];
  for (const [kind, title] of KINDS) {
    const group = categories.filter((c) => c.kind === kind);
    if (!group.length) continue;
    items.push(<ListSubheader key={`h-${kind}`}>{title}</ListSubheader>);
    for (const c of group) items.push(<MenuItem key={c.id} value={c.id}>{labelFor(c)}</MenuItem>);
  }
  return (
    <TextField select fullWidth label={label} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} {...props}>
      {items}
    </TextField>
  );
}
