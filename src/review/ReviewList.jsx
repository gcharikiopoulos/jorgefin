import { useState } from 'react';
import { Box, Card, Typography, useMediaQuery } from '@mui/material';
import { Datagrid, FunctionField, List, NumberField, SimpleList, useListContext } from 'react-admin';
import { Amount } from '../components/Amount.jsx';
import { CategorizePanel } from '../components/CategorizePanel.jsx';
import { SplitLayout } from '../components/SidePanel.jsx';
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

function Rows({ selectedId, onSelect }) {
  const isSmall = useMediaQuery((t) => t.breakpoints.down('md'));
  const { data } = useListContext();
  const selectedSx = (r) => (r.id === selectedId ? { bgcolor: 'action.selected' } : {});
  if (isSmall) {
    return (
      <SimpleList
        primaryText={(r) => r.sample_description || r.description_norm}
        secondaryText={(r) => `${plural(num(r.txn_count), 'transaction')} · ${range(r)}`}
        tertiaryText={(r) => <Amount value={signedTotal(r)} credit={r.direction === 'credit'} />}
        rowClick={(id) => { onSelect(data.find((r) => r.id === id)); return false; }}
        rowSx={(r) => ({ borderBottom: 1, borderColor: 'divider', ...selectedSx(r) })}
      />
    );
  }
  return (
    <Datagrid size="small" bulkActionButtons={false} rowClick={(id, _resource, record) => { onSelect(record); return false; }} rowSx={selectedSx}>
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

function ReviewBody() {
  const { data = [] } = useListContext();
  const [selectedId, setSelectedId] = useState(null);
  const selected = data.find((r) => r.id === selectedId) || null;
  // After a rule is saved its group leaves the queue: move on to the next one.
  const next = (item) => {
    const i = data.findIndex((r) => r.id === item.id);
    const rest = data.filter((r) => r.id !== item.id);
    setSelectedId(rest.length ? rest[Math.min(Math.max(i, 0), rest.length - 1)].id : null);
  };
  return (
    <SplitLayout
      panel={selected && <CategorizePanel item={selected} onClose={() => setSelectedId(null)} onSaved={next} />}
      onClose={() => setSelectedId(null)}
    >
      <Card>
        <Rows selectedId={selectedId} onSelect={(r) => setSelectedId((id) => (id === r.id ? null : r.id))} />
      </Card>
    </SplitLayout>
  );
}

export function ReviewList() {
  return (
    <List title="Review" component={Box} sort={{ field: 'txn_count', order: 'DESC' }} perPage={50} exporter={false} empty={<Empty />} pagination={false}>
      <ReviewBody />
    </List>
  );
}
