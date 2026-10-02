import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem,
  Radio, RadioGroup, Skeleton, Stack, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Title, useDataProvider, useNotify } from 'react-admin';
import { visuallyHidden } from '@mui/utils';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { PanelHeader, PanelTransactions, SplitLayout } from '../components/SidePanel.jsx';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import UpIcon from '@mui/icons-material/KeyboardArrowUp';
import DownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckIcon from '@mui/icons-material/Check';
import { CategoryDot, CategorySelect } from '../components/CategorySelect.jsx';
import { CATEGORY_SWATCHES, amount, categoryColor, categoryTree, formatShortMonth, percent } from '../format.js';
import { useCategories, useMonths, useRefreshAfterWrite } from '../hooks.js';
import { hideBelowMd, hideBelowSm, isTyping, rowSx, tableSx, tdSx, thSx } from '../components/dense.js';
import { Kbd, Label, Mono } from '../dashboard/parts.jsx';
import { monoSx } from '../theme.js';
import { num } from '../backend.js';

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
          width: 24, height: 24, borderRadius: '3px', border: 2, borderColor: selected ? 'text.primary' : 'transparent',
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
              sx={{ height: 24, px: 1, borderRadius: '3px', border: 2, borderColor: !value ? 'text.primary' : 'divider', bgcolor: 'transparent', color: 'text.primary', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 12 }}
            >
              <CategoryDot color={inheritColor} /> Parent
            </Box>
          </Tooltip>
        )}
        {CATEGORY_SWATCHES.map((c) => swatch(c, value?.toLowerCase() === c, () => onChange(c), c))}
        <Tooltip title="Custom colour">
          <Box component="label" sx={{ width: 24, height: 24, borderRadius: '3px', border: 2, borderColor: value && !CATEGORY_SWATCHES.includes(value.toLowerCase()) ? 'text.primary' : 'divider', overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'conic-gradient(#e34948, #eda100, #1baf7a, #2a78d6, #b04fc6, #e34948)' }}>
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

// Totals per category for one month, by kind: Map(categoryId -> total).
function useMonthTotals(month) {
  const dataProvider = useDataProvider();
  return useQuery({
    queryKey: ['category-month-totals', month],
    enabled: !!month,
    queryFn: async () => {
      const kinds = await Promise.all(KINDS.map(([k]) => dataProvider.getCategoryBreakdown(month, k)));
      const totals = new Map();
      for (const rows of kinds) for (const r of rows) if (r.category_id != null) totals.set(r.category_id, (totals.get(r.category_id) || 0) + num(r.total));
      return totals;
    },
  });
}

function IconAction({ label, onClick, disabled, children }) {
  return (
    <Tooltip title={label}>
      <span><IconButton aria-label={label} disabled={disabled} onClick={onClick} sx={{ p: '2px', borderRadius: '2px', color: 'cockpit.tx3', '&:hover': { color: 'cockpit.tx' } }}>{children}</IconButton></span>
    </Tooltip>
  );
}

function CategoryRow({ category, child, first, last, usage, totals, kindTotal, maxTotal, onEdit, onAddChild, onDelete, onMove, onOpen, selected, busy }) {
  const theme = useTheme();
  const { data: categories = [] } = useCategories();
  const color = categoryColor(category.id, categories, theme.palette.mode);
  // A parent's figures include its subcategories, like the list it opens.
  const ids = [category.id, ...categories.filter((c) => c.parent_id === category.id).map((c) => c.id)];
  const count = ids.reduce((s, id) => s + (usage?.get(id) || 0), 0);
  const total = ids.reduce((s, id) => s + (totals?.get(id) || 0), 0);
  const icon = { fontSize: 15 };
  return (
    <Box component="tr" onClick={() => count && onOpen(category)} aria-selected={selected}
      sx={{ ...rowSx({ active: selected }), cursor: count ? 'pointer' : 'default', '&:hover .row-actions': { opacity: 1 } }}>
      <Box component="td" sx={{ ...tdSx, pl: child ? 3.5 : 1.25 }} title={category.name}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.875, minWidth: 0 }}>
          {child && <Box component="span" sx={{ ...monoSx, color: 'cockpit.line2', ml: -1.5, fontSize: 11 }}>└</Box>}
          <Box sx={{ width: child ? 7 : 9, height: child ? 7 : 9, borderRadius: '1px', bgcolor: color, flex: 'none', opacity: child && !category.color ? 0.7 : 1 }} />
          <Box component="span" sx={{ fontWeight: child ? 400 : 600, fontSize: child ? 11.5 : 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{category.name}</Box>
        </Stack>
      </Box>
      <Box component="td" sx={{ ...tdSx, ...hideBelowSm }}>
        {total > 0 && <Box sx={{ height: 4, bgcolor: 'cockpit.line', borderRadius: '1px' }}><Box sx={{ height: 4, width: `${(total / maxTotal) * 100}%`, bgcolor: color, borderRadius: '1px', opacity: child ? 0.7 : 1 }} /></Box>}
      </Box>
      <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 11, textAlign: 'right', fontWeight: child ? 400 : 600, color: total ? 'cockpit.tx' : 'cockpit.tx3' }}>{total ? amount(total) : '—'}</Box>
      <Box component="td" sx={{ ...tdSx, ...hideBelowMd, ...monoSx, fontSize: 10.5, textAlign: 'right', color: 'cockpit.tx3' }}>{total && kindTotal ? percent(total / kindTotal, 1) : ''}</Box>
      <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 10.5, textAlign: 'right', color: selected ? 'cockpit.accText' : count ? 'cockpit.tx2' : 'cockpit.tx3' }} title={ids.length > 1 ? 'Including subcategories' : undefined}>{count || '—'}</Box>
      <Box component="td" sx={{ ...tdSx, textAlign: 'right', pr: 0.75 }} onClick={(e) => e.stopPropagation()}>
        <Stack direction="row" className="row-actions" sx={{ justifyContent: 'flex-end', opacity: { xs: 1, md: 0.45 }, transition: 'opacity .15s' }}>
          <IconAction label={`Move ${category.name} up`} disabled={first || busy} onClick={() => onMove(category, -1)}><UpIcon sx={icon} /></IconAction>
          <IconAction label={`Move ${category.name} down`} disabled={last || busy} onClick={() => onMove(category, 1)}><DownIcon sx={icon} /></IconAction>
          {child ? <Box sx={{ width: 19 }} /> : <IconAction label={`Add subcategory to ${category.name}`} onClick={() => onAddChild(category)}><AddIcon sx={icon} /></IconAction>}
          <IconAction label={`Edit ${category.name}`} onClick={() => onEdit(category)}><EditIcon sx={icon} /></IconAction>
          <IconAction label={`Delete ${category.name}`} onClick={() => onDelete(category)}><DeleteIcon sx={icon} /></IconAction>
        </Stack>
      </Box>
    </Box>
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
        tag="CATEGORY"
        title={category.name}
        subtitle={children.length ? `${KIND_NAMES[category.kind].toUpperCase()} · INCL. ${children.map((c) => c.name).join(', ')}` : KIND_NAMES[category.kind].toUpperCase()}
        icon={<Box sx={{ width: 10, height: 10, borderRadius: '1px', bgcolor: categoryColor(category.id, categories, theme.palette.mode) }} />}
        onClose={onClose}
        action={<Button onClick={() => navigate(`/transactions?filter=${encodeURIComponent(JSON.stringify({ category_id: category.id }))}`)} sx={{ ...monoSx, fontSize: 10, minHeight: 0, py: 0 }}>OPEN IN LEDGER ▸</Button>}
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
  const { data: months = [] } = useMonths();
  const month = months[0]?.month;
  const { data: totals } = useMonthTotals(month);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const categories = categoriesQuery.data || [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenId(null);
      else if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e) && !editing && !deleting) {
        e.preventDefault();
        setEditing({ name: '', kind: 'expense', parent_id: null, color: CATEGORY_SWATCHES[categories.length % 12] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [categories.length, editing, deleting]);

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

  const open = categories.find((c) => c.id === openId) || null;
  const rowProps = { usage, totals, busy, onMove: move, onOpen: (c) => setOpenId((id) => (id === c.id ? null : c.id)), onEdit: (c) => setEditing({ ...c }), onDelete: setDeleting, onAddChild: (p) => setEditing({ name: '', kind: p.kind, parent_id: p.id, color: null }) };
  const monthLabel = month ? formatShortMonth(month).toUpperCase() : '';
  const subCount = categories.filter((c) => c.parent_id != null).length;

  return (
    <Box sx={{ pt: 0.75, pb: 1 }}>
      <Title title="Categories" />
      <SplitLayout panel={open && <CategoryPanel category={open} onClose={() => setOpenId(null)} />} onClose={() => setOpenId(null)}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 30, px: 1.25, mb: '5px', bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
          <Label component="h1" sx={{ color: 'cockpit.tx', m: 0 }}>Categories</Label>
          <Mono sx={{ display: 'flex', gap: 1.5, fontSize: 10.5, color: 'cockpit.tx3', '& b': { fontWeight: 600, color: 'cockpit.tx' } }}>
            <span>TOP-LEVEL <b>{categories.length - subCount}</b></span>
            <span>SUB <b>{subCount}</b></span>
            {month && <span>FIGURES <b>{monthLabel}</b></span>}
          </Mono>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: '15px !important' }} />} onClick={() => setEditing({ name: '', kind: 'expense', parent_id: null, color: CATEGORY_SWATCHES[categories.length % 12] })}>
            Add category <Box component="span" sx={{ ml: 0.75, '& kbd': { color: 'inherit', borderColor: 'rgba(255,255,255,.5)' } }}><Kbd>N</Kbd></Box>
          </Button>
        </Stack>
        {categoriesQuery.isPending && <Skeleton variant="rectangular" height={320} />}
        {categoriesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => categoriesQuery.refetch()}>Retry</Button>}>Could not load categories.</Alert>}
        <Stack spacing="5px">
          {KINDS.map(([kind, title]) => {
            const tree = categoryTree(categories, kind);
            if (!tree.length) return null;
            const all = tree.flatMap((p) => [p, ...p.children]);
            const parentTotal = (p) => [p, ...p.children].reduce((s, c) => s + (totals?.get(c.id) || 0), 0);
            const kindTotal = tree.reduce((s, p) => s + parentTotal(p), 0);
            const maxTotal = Math.max(...tree.map(parentTotal), 1);
            return (
              <Box key={kind} component="section" aria-label={title} sx={{ bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, height: 24, px: 1.25, borderBottom: 1, borderColor: 'cockpit.line' }}>
                  <Label component="h2" sx={{ color: 'cockpit.tx', m: 0 }}>{title}</Label>
                  <Label>{all.length}</Label>
                  <Box sx={{ flexGrow: 1 }} />
                  {kindTotal > 0 && <Mono sx={{ fontSize: 11, fontWeight: 600 }}>{amount(kindTotal)} <Box component="span" sx={{ fontSize: 9.5, color: 'cockpit.tx3', fontWeight: 400 }}>{monthLabel}</Box></Mono>}
                </Stack>
                <Box component="table" sx={tableSx}>
                  <thead><tr>
                    <Box component="th" sx={{ ...thSx, pl: 1.25 }}>Name</Box>
                    <Box component="th" sx={{ ...thSx, ...hideBelowSm, width: '22%' }}>{monthLabel} share</Box>
                    <Box component="th" sx={{ ...thSx, width: 84, textAlign: 'right' }}>{monthLabel} €</Box>
                    <Box component="th" sx={{ ...thSx, ...hideBelowMd, width: 56, textAlign: 'right' }}>%</Box>
                    <Box component="th" sx={{ ...thSx, width: 52, textAlign: 'right' }} title="All transactions, every month">Txns</Box>
                    <Box component="th" sx={{ ...thSx, width: 106 }}><Box component="span" sx={visuallyHidden}>Actions</Box></Box>
                  </tr></thead>
                  <tbody>
                    {tree.map((parent, i) => [
                      <CategoryRow key={parent.id} category={parent} first={i === 0} last={i === tree.length - 1} selected={openId === parent.id} kindTotal={kindTotal} maxTotal={maxTotal} {...rowProps} />,
                      ...parent.children.map((child, j) => (
                        <CategoryRow key={child.id} category={child} child first={j === 0} last={j === parent.children.length - 1} selected={openId === child.id} kindTotal={kindTotal} maxTotal={maxTotal} {...rowProps} />
                      )),
                    ])}
                  </tbody>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </SplitLayout>
      {editing && <CategoryDialog draft={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDialog category={deleting} usage={usage} onClose={() => setDeleting(null)} />}
    </Box>
  );
}
