import { useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Radio, RadioGroup, Skeleton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Title, useDataProvider, useNotify } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PanelHeader, PanelTransactions, SplitLayout } from '../components/SidePanel.jsx';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import UpIcon from '@mui/icons-material/KeyboardArrowUp';
import DownIcon from '@mui/icons-material/KeyboardArrowDown';
import SubdirectoryIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import { CategoryDot, CategorySelect } from '../components/CategorySelect.jsx';
import { CATEGORY_SWATCHES, categoryColor, categoryTree } from '../format.js';
import { useCategories, useRefreshAfterWrite } from '../hooks.js';

const KINDS = [['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']];
const KIND_NAMES = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

const errorText = (err) => (navigator.onLine ? err?.message || 'Could not save. Please try again.' : 'You are offline.');

function useUsage() {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['category-usage'], queryFn: () => dataProvider.getCategoryUsage() });
}

function ColourPicker({ value, onChange, inheritColor }) {
  const swatch = (color, selected, onClick, label) => (
    <Tooltip key={label} title={label}>
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={selected}
        sx={{
          width: 28, height: 28, borderRadius: '50%', border: 2, borderColor: selected ? 'text.primary' : 'transparent',
          bgcolor: color, cursor: 'pointer', p: 0, display: 'grid', placeItems: 'center', color: '#fff',
          outlineOffset: 2,
        }}
      >
        {selected && <CheckIcon sx={{ fontSize: 16 }} />}
      </Box>
    </Tooltip>
  );
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Colour</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {inheritColor && (
          <Tooltip title="Same as parent">
            <Box
              component="button"
              type="button"
              onClick={() => onChange(null)}
              aria-label="Same as parent"
              aria-pressed={!value}
              sx={{ height: 28, px: 1.25, borderRadius: 14, border: 2, borderColor: !value ? 'text.primary' : 'divider', bgcolor: 'transparent', color: 'text.primary', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 12 }}
            >
              <CategoryDot color={inheritColor} /> Parent
            </Box>
          </Tooltip>
        )}
        {CATEGORY_SWATCHES.map((c) => swatch(c, value?.toLowerCase() === c, () => onChange(c), c))}
        <Tooltip title="Custom colour">
          <Box component="label" sx={{ width: 28, height: 28, borderRadius: '50%', border: 2, borderColor: value && !CATEGORY_SWATCHES.includes(value.toLowerCase()) ? 'text.primary' : 'divider', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'conic-gradient(#e34948, #eda100, #1baf7a, #2a78d6, #b04fc6, #e34948)' }}>
            <input type="color" value={value || '#888888'} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
          </Box>
        </Tooltip>
      </Stack>
    </Box>
  );
}

// Add or edit a category. `draft` is { id?, name, kind, parent_id, color }.
function CategoryDialog({ draft, onClose }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefreshAfterWrite();
  const theme = useTheme();
  const fullScreen = useMediaQuery((t) => t.breakpoints.down('sm'));
  const { data: categories = [] } = useCategories();
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const hasChildren = form.id != null && categories.some((c) => c.parent_id === form.id);
  const parent = categories.find((c) => c.id === form.parent_id) || null;
  const parentChoices = categoryTree(categories).filter((c) => c.id !== form.id);

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setError('Enter a name.');
    setSaving(true);
    setError('');
    try {
      await dataProvider.saveCategory({ id: form.id ?? null, name: form.name.trim(), kind: parent ? parent.kind : form.kind, parentId: form.parent_id ?? null, color: form.color });
      notify(form.id ? 'Category saved' : 'Category added', { type: 'success' });
      refresh();
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen} component="form" onSubmit={save}>
      <DialogTitle>{form.id ? 'Edit category' : form.parent_id ? 'Add subcategory' : 'Add category'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus slotProps={{ htmlInput: { maxLength: 60 } }} />
          <TextField
            select
            label="Parent"
            value={form.parent_id ?? ''}
            onChange={(e) => set({ parent_id: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={hasChildren}
            helperText={hasChildren ? 'It has subcategories, so it stays top-level.' : 'Subcategories go one level deep.'}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                renderValue: (v) => {
                  const p = categories.find((c) => c.id === v);
                  return p ? <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}><CategoryDot color={categoryColor(p.id, categories, theme.palette.mode)} />{p.name}</Box> : 'None (top-level)';
                },
              },
            }}
          >
            <MenuItem value="">None (top-level)</MenuItem>
            {parentChoices.map((c) => (
              <MenuItem key={c.id} value={c.id} sx={{ gap: 1 }}>
                <CategoryDot color={categoryColor(c.id, categories, theme.palette.mode)} />
                {c.name}
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>{KIND_NAMES[c.kind]}</Typography>
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Kind" value={parent ? parent.kind : form.kind} onChange={(e) => set({ kind: e.target.value })} disabled={!!parent}
            helperText={parent ? 'Subcategories have their parent’s kind.' : hasChildren ? 'Its subcategories change with it.' : 'Expenses and income count in the totals; transfers do not.'}>
            {KINDS.map(([k]) => <MenuItem key={k} value={k}>{KIND_NAMES[k]}</MenuItem>)}
          </TextField>
          <ColourPicker value={form.color} onChange={(color) => set({ color })} inheritColor={parent ? categoryColor(parent.id, categories, theme.palette.mode) : null} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ category, usage, onClose }) {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefreshAfterWrite();
  const { data: categories = [] } = useCategories();
  const children = categories.filter((c) => c.parent_id === category.id);
  const count = usage?.get(category.id) ?? 0;
  const [mode, setMode] = useState(count ? 'move' : 'clear');
  const [replaceId, setReplaceId] = useState(category.parent_id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (mode === 'move' && !replaceId) return setError('Choose where to move its transactions.');
    setSaving(true);
    setError('');
    try {
      const moved = await dataProvider.deleteCategory({ id: category.id, replaceId: mode === 'move' ? replaceId : null });
      notify(moved ? `Category deleted; ${moved} ${moved === 1 ? 'transaction' : 'transactions'} ${mode === 'move' ? 'moved' : 'now uncategorised'}` : 'Category deleted', { type: 'success' });
      refresh();
      onClose();
    } catch (err) {
      console.error(err);
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete “{category.name}”?</DialogTitle>
      <DialogContent>
        {children.length ? (
          <Alert severity="info">It has {children.length} {children.length === 1 ? 'subcategory' : 'subcategories'}. Move or delete {children.length === 1 ? 'it' : 'them'} first.</Alert>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              {count ? `${count} ${count === 1 ? 'transaction uses' : 'transactions use'} this category. Rules that set it change the same way.` : 'No transactions use this category.'}
            </Typography>
            {count > 0 && (
              <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
                <FormControlLabel value="move" control={<Radio />} label="Move them to another category" />
                {mode === 'move' && <Box sx={{ pl: 4, pb: 1 }}><CategorySelect value={replaceId} onChange={setReplaceId} label="Move to" exclude={[category.id]} /></Box>}
                <FormControlLabel value="clear" control={<Radio />} label="Leave them uncategorised (its rules are removed)" />
              </RadioGroup>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{children.length ? 'Close' : 'Cancel'}</Button>
        {!children.length && <Button color="error" variant="contained" onClick={confirm} disabled={saving}>Delete</Button>}
      </DialogActions>
    </Dialog>
  );
}

function CategoryRow({ category, child, first, last, usage, onEdit, onAddChild, onDelete, onMove, onOpen, selected, busy }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  const color = categoryColor(category.id, categories, theme.palette.mode);
  // A parent's count includes its subcategories, like the list it opens.
  const ids = [category.id, ...categories.filter((c) => c.parent_id === category.id).map((c) => c.id)];
  const count = ids.reduce((s, id) => s + (usage?.get(id) || 0), 0);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, py: 0.5, pl: child ? 4.5 : 1.5, pr: 1, borderTop: 1, borderColor: 'divider', bgcolor: selected ? 'action.selected' : undefined, '&:hover .row-actions': { opacity: 1 } }}>
      {child && <SubdirectoryIcon sx={{ fontSize: 16, color: 'text.disabled', ml: -3, mr: 0.5 }} />}
      <Box sx={{ width: child ? 10 : 14, height: child ? 10 : 14, borderRadius: child ? '50%' : '4px', bgcolor: color, flex: 'none', opacity: child && !category.color ? 0.7 : 1 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: child ? 400 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.name}</Typography>
      </Box>
      {count > 0 && (
        <Button size="small" variant="text" onClick={() => onOpen(category)} aria-pressed={selected} title={ids.length > 1 ? 'Including subcategories' : undefined}
          sx={{ minWidth: 0, px: 1, whiteSpace: 'nowrap', fontWeight: 500, fontSize: 12, color: selected ? 'primary.main' : 'text.secondary' }}>
          {count} {count === 1 ? 'txn' : 'txns'}
        </Button>
      )}
      <Stack direction="row" className="row-actions" sx={{ opacity: { xs: 1, md: 0.55 }, transition: 'opacity .15s' }}>
        <Tooltip title="Move up"><span><IconButton aria-label={`Move ${category.name} up`} disabled={first || busy} onClick={() => onMove(category, -1)}><UpIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Move down"><span><IconButton aria-label={`Move ${category.name} down`} disabled={last || busy} onClick={() => onMove(category, 1)}><DownIcon fontSize="small" /></IconButton></span></Tooltip>
        {!child && <Tooltip title="Add subcategory"><IconButton aria-label={`Add subcategory to ${category.name}`} onClick={() => onAddChild(category)}><AddIcon fontSize="small" /></IconButton></Tooltip>}
        <Tooltip title="Edit"><IconButton aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}><EditIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="Delete"><IconButton aria-label={`Delete ${category.name}`} onClick={() => onDelete(category)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Stack>
  );
}

function CategoryPanel({ category, onClose }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();
  const children = categories.filter((c) => c.parent_id === category.id);
  return (
    <>
      <PanelHeader
        title={category.name}
        subtitle={children.length ? `Including ${children.map((c) => c.name).join(', ')}` : KIND_NAMES[category.kind]}
        icon={<CategoryDot color={categoryColor(category.id, categories, theme.palette.mode)} size={12} />}
        onClose={onClose}
        action={<Button size="small" onClick={() => navigate(`/transactions?filter=${encodeURIComponent(JSON.stringify({ category_id: category.id }))}`)}>Open list</Button>}
      />
      <PanelTransactions key={category.id} filter={{ category_id: category.id }} showCategory={children.length > 0} />
    </>
  );
}

export function CategoryList() {
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefreshAfterWrite();
  const categoriesQuery = useCategories();
  const { data: usage } = useUsage();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const categories = categoriesQuery.data || [];

  const move = async (category, direction) => {
    setBusy(true);
    try {
      await dataProvider.moveCategory({ id: category.id, direction });
      await refresh();
    } catch (err) {
      console.error(err);
      notify(errorText(err), { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const [openId, setOpenId] = useState(null);
  const open = categories.find((c) => c.id === openId) || null;
  const rowProps = { usage, busy, onMove: move, onOpen: (c) => setOpenId((id) => (id === c.id ? null : c.id)), onEdit: (c) => setEditing({ ...c }), onDelete: setDeleting, onAddChild: (p) => setEditing({ name: '', kind: p.kind, parent_id: p.id, color: null }) };

  return (
    <Box sx={{ pt: 1, pb: 3 }}>
      <Title title="Categories" />
      <SplitLayout panel={open && <CategoryPanel category={open} onClose={() => setOpenId(null)} />} onClose={() => setOpenId(null)}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h5" component="h1">Categories</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', kind: 'expense', parent_id: null, color: CATEGORY_SWATCHES[categories.length % 12] })}>Add category</Button>
      </Stack>
      {categoriesQuery.isPending && <Skeleton variant="rounded" height={320} />}
      {categoriesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => categoriesQuery.refetch()}>Retry</Button>}>Could not load categories.</Alert>}
      <Stack spacing={1.5}>
        {KINDS.map(([kind, title]) => {
          const tree = categoryTree(categories, kind);
          if (!tree.length) return null;
          return (
            <Card key={kind}>
              <Typography variant="subtitle2" sx={{ px: 1.5, py: 1, color: 'text.secondary' }}>{title}</Typography>
              {tree.map((parent, i) => (
                <Box key={parent.id}>
                  <CategoryRow category={parent} first={i === 0} last={i === tree.length - 1} selected={openId === parent.id} {...rowProps} />
                  {parent.children.map((child, j) => (
                    <CategoryRow key={child.id} category={child} child first={j === 0} last={j === parent.children.length - 1} selected={openId === child.id} {...rowProps} />
                  ))}
                </Box>
              ))}
            </Card>
          );
        })}
      </Stack>
      </SplitLayout>
      {editing && <CategoryDialog draft={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDialog category={deleting} usage={usage} onClose={() => setDeleting(null)} />}
    </Box>
  );
}
