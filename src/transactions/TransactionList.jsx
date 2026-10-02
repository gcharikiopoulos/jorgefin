import { useState } from 'react';
import { Box, Stack, Typography, useMediaQuery } from '@mui/material';
import { Datagrid, FunctionField, List, Loading, SearchInput, SelectInput, SimpleList, useListContext } from 'react-admin';
import { CategoryChip } from '../components/CategoryChip.jsx';
import { Amount } from '../components/Amount.jsx';
import { SetCategoryDialog } from '../components/SetCategoryDialog.jsx';
import { formatDate, formatMonth, formatTime, txnName, txnTypeLabel } from '../format.js';
import { useCategories, useMonths } from '../hooks.js';

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// Second line under the name: the bank's own description when it differs, the type and the note.
const details = (r) => [txnName(r).detail, txnTypeLabel(r.txn_type), r.note].filter(Boolean).join(' · ');

function DateCell({ record }) {
  const time = formatTime(record.txn_at);
  return (
    <Box sx={{ whiteSpace: 'nowrap' }}>
      <Typography variant="body2">{formatDate(record.txn_date)}</Typography>
      {time && <Typography variant="caption" color="text.secondary">{time}</Typography>}
    </Box>
  );
}

function Rows({ onSelect }) {
  const isSmall = useMediaQuery((t) => t.breakpoints.down('md'));
  const { data } = useListContext();
  if (isSmall) {
    return (
      <SimpleList
        primaryText={(r) => txnName(r).name}
        secondaryText={(r) => (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.25 }} component="span">
            <span>{[formatDate(r.txn_date), formatTime(r.txn_at)].filter(Boolean).join(' ')}</span>
            <CategoryChip categoryId={r.category_id} name={r.category} color={r.color} />
          </Stack>
        )}
        tertiaryText={(r) => <Amount value={r.signed_amount} credit={r.direction === 'credit'} />}
        rowClick={(id) => { onSelect(data.find((r) => r.id === id)); return false; }}
        rowSx={() => ({ borderBottom: 1, borderColor: 'divider' })}
      />
    );
  }
  return (
    <Datagrid size="small" bulkActionButtons={false} rowClick={(id, _resource, record) => { onSelect(record); return false; }}
      sx={{ '& .RaDatagrid-table': { tableLayout: 'fixed' }, '& .column-date': { width: 104 }, '& .column-category': { width: 180 }, '& .column-signed_amount': { width: 120 } }}>
      <FunctionField source="date" label="Date" sortBy="txn_date" render={(r) => <DateCell record={r} />} />
      <FunctionField source="merchant_name" label="Description" sortBy="merchant_name" render={(r) => {
        const extra = details(r);
        return (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, ...ellipsis }} title={txnName(r).name}>{txnName(r).name}</Typography>
            {extra && <Typography variant="caption" color="text.secondary" component="div" sx={ellipsis} title={extra}>{extra}</Typography>}
          </Box>
        );
      }} />
      <FunctionField source="category" label="Category" sortBy="category" render={(r) => <CategoryChip categoryId={r.category_id} name={r.category} color={r.color} />} />
      <FunctionField source="signed_amount" label="Amount" sortBy="signed_amount" textAlign="right" render={(r) => <Amount value={r.signed_amount} credit={r.direction === 'credit'} />} />
    </Datagrid>
  );
}

export function TransactionList() {
  const [selected, setSelected] = useState(null);
  const { data: months, isPending } = useMonths();
  const { data: categories = [] } = useCategories();
  if (isPending) return <Loading />;

  const monthChoices = (months || []).map((m) => ({ id: m.month, name: formatMonth(m.month) }));
  const categoryChoices = [{ id: 'none', name: 'Uncategorised' }, ...categories.map((c) => ({ id: c.id, name: c.name }))];
  const filters = [
    <SearchInput key="q" source="q" size="small" alwaysOn placeholder="Search merchant or description" />,
    <SelectInput key="month" source="month" size="small" label="Month" choices={monthChoices} alwaysOn emptyText="All months" />,
    <SelectInput key="cat" source="category_id" size="small" label="Category" choices={categoryChoices} alwaysOn emptyText="All categories" />,
  ];

  return (
    <>
      <List
        title="Transactions"
        sx={{ maxWidth: 1200 }}
        filters={filters}
        filterDefaultValues={monthChoices[0] ? { month: monthChoices[0].id } : {}}
        sort={{ field: 'txn_date', order: 'DESC' }}
        perPage={50}
        exporter={false}
        empty={false}
      >
        <Rows onSelect={setSelected} />
      </List>
      <SetCategoryDialog transaction={selected} onClose={() => setSelected(null)} />
    </>
  );
}

