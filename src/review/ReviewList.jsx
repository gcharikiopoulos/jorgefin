import { useState } from 'react';
import { Box, Typography, useMediaQuery } from '@mui/material';
import { Datagrid, FunctionField, List, NumberField, SimpleList, useListContext } from 'react-admin';
import { Amount } from '../components/Amount.jsx';
import { CategorizeDialog } from '../components/CategorizeDialog.jsx';
import { formatDate, sameText } from '../format.js';
import { num } from '../backend.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const range = (r) => (r.first_seen === r.last_seen ? formatDate(r.first_seen) : `${formatDate(r.first_seen)} – ${formatDate(r.last_seen)}`);
const signedTotal = (r) => (r.direction === 'credit' ? num(r.total_amount) : -num(r.total_amount));

function Empty() {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h6">All caught up</Typography>
      <Typography color="text.secondary">Every transaction has a category.</Typography>
    </Box>
  );
}

function Rows({ onSelect }) {
  const isSmall = useMediaQuery((t) => t.breakpoints.down('md'));
  const { data } = useListContext();
  if (isSmall) {
    return (
      <SimpleList
        primaryText={(r) => r.sample_description || r.description_norm}
        secondaryText={(r) => `${plural(num(r.txn_count), 'transaction')} · ${range(r)}`}
        tertiaryText={(r) => <Amount value={signedTotal(r)} credit={r.direction === 'credit'} />}
        rowClick={(id) => { onSelect(data.find((r) => r.id === id)); return false; }}
        rowSx={() => ({ borderBottom: 1, borderColor: 'divider' })}
      />
    );
  }
  return (
    <Datagrid size="small" bulkActionButtons={false} rowClick={(id, _resource, record) => { onSelect(record); return false; }}>
      <FunctionField label="Description" sortBy="sample_description" render={(r) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.sample_description}</Typography>
          {!sameText(r.sample_description, r.description_norm) && <Typography variant="caption" color="text.secondary">{r.description_norm}</Typography>}
        </Box>
      )} />
      <NumberField source="txn_count" label="Transactions" />
      <FunctionField label="Seen" sortBy="last_seen" render={range} />
      <FunctionField label="Total" sortBy="total_amount" textAlign="right" render={(r) => <Amount value={signedTotal(r)} credit={r.direction === 'credit'} />} />
    </Datagrid>
  );
}

export function ReviewList() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <List title="Review" sx={{ maxWidth: 1200 }} sort={{ field: 'txn_count', order: 'DESC' }} perPage={50} exporter={false} empty={<Empty />} pagination={false}>
        <Rows onSelect={setSelected} />
      </List>
      <CategorizeDialog item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
