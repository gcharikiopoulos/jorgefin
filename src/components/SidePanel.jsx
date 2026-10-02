import { useState } from 'react';
import { Box, Button, Drawer, IconButton, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDataProvider } from 'react-admin';
import CloseIcon from '@mui/icons-material/Close';
import { CategoryTag } from './CategoryTag.jsx';
import { SetCategoryDialog } from './SetCategoryDialog.jsx';
import { Label, Mono } from '../dashboard/parts.jsx';
import { tableSx, tdSx, thSx } from './dense.js';
import { formatDayMonth, formatTime, signedAmount, txnName } from '../format.js';
import { monoSx } from '../theme.js';
import { num } from '../backend.js';

const PANEL_WIDTH = 380;

// Page content with a panel on the right. On wide screens the panel sits beside
// the content and stays in view while it scrolls; on small screens it slides in.
export function SplitLayout({ children, panel, onClose }) {
  const wide = useMediaQuery((t) => t.breakpoints.up('lg'));
  if (!wide) {
    return (
      <>
        {children}
        <Drawer anchor="right" open={!!panel} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: PANEL_WIDTH + 40 }, bgcolor: 'cockpit.panel' } } }}>
          {panel}
        </Drawer>
      </>
    );
  }
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: panel ? `minmax(0, 1fr) ${PANEL_WIDTH}px` : 'minmax(0, 1fr)', gap: '5px', alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
      {panel && (
        <Box component="aside" sx={{ position: 'sticky', top: 44, maxHeight: 'calc(100vh - 76px)', overflow: 'auto', bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px' }}>
          {panel}
        </Box>
      )}
    </Box>
  );
}

export function PanelHeader({ tag = 'INSPECT', title, subtitle, icon, onClose, action }) {
  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, height: 30, px: 1.5, borderBottom: 1, borderColor: 'cockpit.line' }}>
        <Mono sx={{ fontSize: 9, color: 'cockpit.tx3', border: 1, borderColor: 'cockpit.line2', borderRadius: '2px', px: 0.5, lineHeight: '14px' }}>{tag}</Mono>
        <Box sx={{ flexGrow: 1 }} />
        {action}
        <IconButton aria-label="Close panel (Esc)" onClick={onClose} sx={{ p: '1px' }}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1, px: 1.5, pt: 1.25, pb: 1 }}>
        {icon && <Box sx={{ pt: 0.375 }}>{icon}</Box>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{title}</Typography>
          {subtitle && <Mono component="div" sx={{ fontSize: 10, color: 'cockpit.tx3', mt: 0.25 }}>{subtitle}</Mono>}
        </Box>
      </Stack>
    </>
  );
}

// Transactions matching `filter`, newest first, 50 at a time. Clicking one opens
// the category dialog. `note(row)` can add a line under a row.
export function PanelTransactions({ filter, showCategory = true, note, title = 'Transactions' }) {
  const dataProvider = useDataProvider();
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState(null);
  const key = JSON.stringify(filter);
  const query = useQuery({
    queryKey: ['panel-transactions', key, limit],
    queryFn: () => dataProvider.getList('transactions', { pagination: { page: 1, perPage: limit }, sort: { field: 'txn_date', order: 'DESC' }, filter }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <Stack spacing={0.5} sx={{ p: 1.5 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rectangular" height={22} />)}</Stack>;
  if (query.isError) {
    return (
      <Stack sx={{ p: 1.5, alignItems: 'flex-start', gap: 1 }} role="alert">
        <Typography variant="body2" color="error">{navigator.onLine ? 'Could not load the transactions.' : 'You are offline.'}</Typography>
        <Button variant="outlined" onClick={() => query.refetch()}>Retry</Button>
      </Stack>
    );
  }
  const { data: rows, total } = query.data;
  if (!rows.length) return <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>No transactions.</Typography>;
  const shownTotal = rows.reduce((s, r) => s + num(r.signed_amount), 0);

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, height: 24, px: 1.5, borderTop: 1, borderColor: 'cockpit.line' }}>
        <Label sx={{ color: 'cockpit.tx' }}>{title}</Label>
        <Box sx={{ flexGrow: 1 }} />
        <Mono sx={{ fontSize: 10, color: 'cockpit.tx3' }}>{rows.length < total ? `${rows.length}/${total}` : total} · <Box component="b" sx={{ color: 'cockpit.tx', fontWeight: 600 }}>{signedAmount(shownTotal)}</Box></Mono>
      </Stack>
      <Box component="table" sx={tableSx}>
        <thead><tr>
          <Box component="th" sx={{ ...thSx, width: 96, pl: 1.5 }}>Date</Box>
          <Box component="th" sx={thSx}>Merchant</Box>
          <Box component="th" sx={{ ...thSx, width: 86, textAlign: 'right', pr: 1.5 }}>€</Box>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const { name } = txnName(r);
            const extra = note?.(r);
            return (
              <Box component="tr" key={r.id} onClick={() => setSelected(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r); }}
                sx={{ cursor: 'pointer', '&:hover > td, &:focus-visible > td': { bgcolor: 'cockpit.panel2' }, outline: 'none' }}>
                <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 10.5, color: 'cockpit.tx2', pl: 1.5 }}>{formatDayMonth(r.txn_date)} <Box component="span" sx={{ color: 'cockpit.tx3' }}>{formatTime(r.txn_at)}</Box></Box>
                <Box component="td" sx={{ ...tdSx, height: extra || showCategory ? 34 : 26 }} title={name}>
                  <Box sx={{ fontWeight: 600, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', ...(r.merchant_name ? {} : { ...monoSx, fontSize: 10.5, color: 'cockpit.tx2' }) }}>{name}</Box>
                  {(showCategory || extra) && (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      {showCategory && <CategoryTag categoryId={r.category_id} name={r.category} color={r.color} sx={{ height: 14, fontSize: 9.5 }} />}
                      {extra && <Mono sx={{ fontSize: 9.5, color: 'cockpit.tx3', overflow: 'hidden', textOverflow: 'ellipsis' }}>{extra}</Mono>}
                    </Stack>
                  )}
                </Box>
                <Box component="td" sx={{ ...tdSx, ...monoSx, fontSize: 11, fontWeight: 600, textAlign: 'right', pr: 1.5, color: r.direction === 'credit' ? 'cockpit.pos' : 'cockpit.tx' }}>{signedAmount(r.signed_amount)}</Box>
              </Box>
            );
          })}
        </tbody>
      </Box>
      {rows.length < total && (
        <Box sx={{ p: 1, textAlign: 'center' }}>
          <Button onClick={() => setLimit((n) => n + 50)} disabled={query.isFetching}>Show more</Button>
        </Box>
      )}
      <SetCategoryDialog transaction={selected} onClose={() => setSelected(null)} />
    </Box>
  );
}
