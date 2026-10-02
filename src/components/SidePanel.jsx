import { useState } from 'react';
import { Box, Button, Card, Drawer, IconButton, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDataProvider } from 'react-admin';
import CloseIcon from '@mui/icons-material/Close';
import { Amount } from './Amount.jsx';
import { CategoryChip } from './CategoryChip.jsx';
import { SetCategoryDialog } from './SetCategoryDialog.jsx';
import { formatDate, formatTime, money, txnName } from '../format.js';
import { num } from '../backend.js';

const PANEL_WIDTH = 440;

// Page content with a panel on the right. On wide screens the panel sits beside
// the content and stays in view while it scrolls; on small screens it slides in.
export function SplitLayout({ children, panel, onClose }) {
  const wide = useMediaQuery((t) => t.breakpoints.up('lg'));
  if (!wide) {
    return (
      <>
        {children}
        <Drawer anchor="right" open={!!panel} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: PANEL_WIDTH } } } }}>
          {panel}
        </Drawer>
      </>
    );
  }
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ flex: '1 1 auto', minWidth: 0, maxWidth: panel ? 760 : 1200 }}>{children}</Box>
      {panel && (
        <Card sx={{ flex: `0 0 ${PANEL_WIDTH}px`, position: 'sticky', top: 64, maxHeight: 'calc(100vh - 76px)', overflow: 'auto' }}>
          {panel}
        </Card>
      )}
    </Box>
  );
}

export function PanelHeader({ title, subtitle, icon, onClose, action }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1, p: 2, pb: 1 }}>
      {icon && <Box sx={{ pt: 0.5 }}>{icon}</Box>}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 650, overflowWrap: 'anywhere' }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {action}
      <IconButton aria-label="Close panel" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
    </Stack>
  );
}

// Transactions matching `filter`, newest first, 50 at a time. Clicking one opens
// the category dialog. `note(row)` can add a line under a row.
export function PanelTransactions({ filter, showCategory = true, note }) {
  const dataProvider = useDataProvider();
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState(null);
  const key = JSON.stringify(filter);
  const query = useQuery({
    queryKey: ['panel-transactions', key, limit],
    queryFn: () => dataProvider.getList('transactions', { pagination: { page: 1, perPage: limit }, sort: { field: 'txn_date', order: 'DESC' }, filter }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <Stack spacing={1} sx={{ p: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={40} />)}</Stack>;
  if (query.isError) {
    return (
      <Stack sx={{ p: 2, alignItems: 'flex-start', gap: 1 }} role="alert">
        <Typography color="error">{navigator.onLine ? 'Could not load the transactions.' : 'You are offline.'}</Typography>
        <Button variant="outlined" onClick={() => query.refetch()}>Retry</Button>
      </Stack>
    );
  }
  const { data: rows, total } = query.data;
  if (!rows.length) return <Typography color="text.secondary" sx={{ p: 2 }}>No transactions.</Typography>;
  const shownTotal = rows.reduce((s, r) => s + num(r.signed_amount), 0);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, pb: 0.5 }}>
        {rows.length < total ? `Latest ${rows.length} of ${total}` : `${total} ${total === 1 ? 'transaction' : 'transactions'}`} · {money(shownTotal)}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((r) => {
          const { name } = txnName(r);
          const extra = note?.(r);
          return (
            <Box component="li" key={r.id}>
              <Box
                component="button"
                type="button"
                onClick={() => setSelected(r)}
                sx={{
                  all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', gap: 1, alignItems: 'center',
                  px: 2, py: 0.75, borderTop: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Typography>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{[formatDate(r.txn_date), formatTime(r.txn_at)].filter(Boolean).join(' ')}</Typography>
                    {showCategory && <CategoryChip categoryId={r.category_id} name={r.category} color={r.color} />}
                  </Stack>
                  {extra && <Typography variant="caption" color="text.secondary" component="div">{extra}</Typography>}
                </Box>
                <Amount value={r.signed_amount} credit={r.direction === 'credit'} />
              </Box>
            </Box>
          );
        })}
      </Box>
      {rows.length < total && (
        <Box sx={{ p: 1.5, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={() => setLimit((n) => n + 50)} disabled={query.isFetching}>Show more</Button>
        </Box>
      )}
      <SetCategoryDialog transaction={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
