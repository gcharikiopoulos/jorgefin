import { useState } from 'react';
import { Box, Stack, Typography, useMediaQuery } from '@mui/material';
import { Datagrid, FunctionField, List, Loading, SearchInput, SelectInput, SimpleList, TextField, useListContext } from 'react-admin';
import { CategoryChip } from '../components/CategoryChip.jsx';
import { Amount } from '../components/Amount.jsx';
import { SetCategoryDialog } from '../components/SetCategoryDialog.jsx';
import { formatDate, formatMonth } from '../format.js';
import { useCategories, useMonths } from '../hooks.js';

function Rows({ onSelect }) {
  const isSmall = useMediaQuery((t) => t.breakpoints.down('md'));
  const { data } = useListContext();
  if (isSmall) {
    return (
      <SimpleList
        primaryText={(r) => r.merchant_name || r.description}
        secondaryText={(r) => (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }} component="span">
            <span>{formatDate(r.txn_date)}</span>
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
    <Datagrid bulkActionButtons={false} rowClick={(id, _resource, record) => { onSelect(record); return false; }} sx={{ '& .RaDatagrid-headerCell': { fontWeight: 600 } }}>
      <FunctionField label="Date" sortBy="txn_date" render={(r) => formatDate(r.txn_date)} />
      <FunctionField label="Merchant" sortBy="merchant_name" render={(r) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.merchant_name || r.description}</Typography>
          {r.merchant_name && <Typography variant="caption" color="text.secondary">{r.description}</Typography>}
        </Box>
      )} />
      <FunctionField label="Category" sortBy="category" render={(r) => <CategoryChip categoryId={r.category_id} name={r.category} color={r.color} />} />
      <TextField source="note" label="Note" sortable={false} emptyText="" />
      <FunctionField label="Amount" sortBy="signed_amount" textAlign="right" render={(r) => <Amount value={r.signed_amount} credit={r.direction === 'credit'} />} />
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
    <SearchInput key="q" source="q" alwaysOn placeholder="Search merchant or description" />,
    <SelectInput key="month" source="month" label="Month" choices={monthChoices} alwaysOn emptyText="All months" />,
    <SelectInput key="cat" source="category_id" label="Category" choices={categoryChoices} alwaysOn emptyText="All categories" />,
  ];

  return (
    <>
      <List
        title="Transactions"
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

