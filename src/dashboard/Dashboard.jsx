import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, Grid, IconButton, LinearProgress, List as MuiList, ListItemButton, ListItemText, MenuItem, Skeleton, Stack, TextField, Typography, useTheme } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useDataProvider, Title } from 'react-admin';
import { useQuery } from '@tanstack/react-query';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowDownwardIcon from '@mui/icons-material/SouthWest';
import ArrowUpwardIcon from '@mui/icons-material/NorthEast';
import SavingsIcon from '@mui/icons-material/SavingsOutlined';
import RuleIcon from '@mui/icons-material/RuleOutlined';
import { Panel, QueryState, KpiCard, delta } from './parts.jsx';
import { CategoryChip } from '../components/CategoryChip.jsx';
import { Amount } from '../components/Amount.jsx';
import { useCategories, useMonths } from '../hooks.js';
import { isMock, num } from '../backend.js';
import { REST_COLOR, categoryColor, compactMoney, formatDate, formatMonth, formatShortMonth, money, parseDate, percent, seriesColor } from '../format.js';

const MAX_SLICES = 8;
const transactionsLink = (filter) => `/transactions?filter=${encodeURIComponent(JSON.stringify(filter))}`;

function MonthPicker({ months, index, onChange }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <IconButton aria-label="Previous month" onClick={() => onChange(index + 1)} disabled={index >= months.length - 1}><ChevronLeftIcon /></IconButton>
      <TextField
        select
        size="small"
        value={months[index]?.month ?? ''}
        onChange={(e) => onChange(months.findIndex((m) => m.month === e.target.value))}
        sx={{ minWidth: 180, '& .MuiSelect-select': { textTransform: 'capitalize', fontWeight: 600 } }}
        slotProps={{ htmlInput: { 'aria-label': 'Month' } }}
      >
        {months.map((m) => <MenuItem key={m.month} value={m.month} sx={{ textTransform: 'capitalize' }}>{formatMonth(m.month)}</MenuItem>)}
      </TextField>
      <IconButton aria-label="Next month" onClick={() => onChange(index - 1)} disabled={index <= 0}><ChevronRightIcon /></IconButton>
    </Stack>
  );
}

function KpiRow({ months, index }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const mode = theme.palette.mode;
  const m = months[index];
  const prev = months[index + 1];
  // Up to 12 months ending at the selected one, oldest first, for the sparklines.
  const window = months.slice(index, index + 12).reverse();
  const labels = window.map((w) => formatShortMonth(w.month));
  const series = (key) => window.map((w) => num(w[key]));
  const net = num(m.net);
  const income = num(m.income);
  const savingsRate = m.savings_rate != null ? num(m.savings_rate) : income ? net / income : null;
  const uncategorised = num(m.uncategorized_count);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <KpiCard label="Income" icon={<ArrowDownwardIcon fontSize="small" />} value={money(m.income)} caption={`${num(m.txn_count)} transactions`}
          trend={series('income')} trendLabels={labels} color={seriesColor(0, mode)} deltaValue={delta(income, prev && num(prev.income))} valueFormatter={(v) => money(v)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <KpiCard label="Expenses" icon={<ArrowUpwardIcon fontSize="small" />} value={money(m.expenses)} caption={`Transfers out ${money(m.transfers_out)}`}
          trend={series('expenses')} trendLabels={labels} color={seriesColor(1, mode)} deltaValue={delta(num(m.expenses), prev && num(prev.expenses))} goodWhenUp={false} valueFormatter={(v) => money(v)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <KpiCard label="Net" icon={<SavingsIcon fontSize="small" />} value={<Box component="span" sx={{ color: net >= 0 ? 'success.main' : 'error.main' }}>{(net > 0 ? '+' : '') + money(net)}</Box>}
          caption={savingsRate != null ? `Savings rate ${percent(savingsRate)}` : 'No income this month'}
          trend={series('net')} trendLabels={labels} color={seriesColor(2, mode)} deltaValue={delta(net, prev && num(prev.net))} valueFormatter={(v) => money(v)} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <KpiCard label="To review" icon={<RuleIcon fontSize="small" />} value={uncategorised === 0 ? 'All done' : String(uncategorised)}
          caption={uncategorised === 0 ? 'Every transaction has a category' : 'Uncategorised this month · tap to review'}
          onClick={uncategorised ? () => navigate('/review') : undefined} />
      </Grid>
    </Grid>
  );
}

function CashFlowChart({ months, index }) {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const window = months.slice(index, index + 12).reverse();
  return (
    <Panel title="Cash flow" subtitle="Income and expenses by month">
      <BarChart
        height={360}
        borderRadius={4}
        grid={{ horizontal: true }}
        margin={{ left: 0, right: 8, top: 16, bottom: 0 }}
        xAxis={[{ scaleType: 'band', data: window.map((w) => formatShortMonth(w.month)), categoryGapRatio: 0.35, barGapRatio: 0.15 }]}
        yAxis={[{ valueFormatter: (v) => compactMoney(v), width: 64 }]}
        series={[
          { data: window.map((w) => num(w.income)), label: 'Income', color: seriesColor(0, mode), valueFormatter: (v) => money(v) },
          { data: window.map((w) => num(w.expenses)), label: 'Expenses', color: seriesColor(1, mode), valueFormatter: (v) => money(v) },
        ]}
        slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
      />
    </Panel>
  );
}

function CategoryDonut({ month }) {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const { data: categories = [] } = useCategories();
  const query = useQuery({ queryKey: ['breakdown', month], queryFn: () => dataProvider.getCategoryBreakdown(month, 'expense') });

  return (
    <Panel title="Spending by category" subtitle={formatMonth(month)}>
      <QueryState query={query} height={280} empty="No spending this month.">
        {(rows) => {
          const total = rows.reduce((s, r) => s + num(r.total), 0);
          const top = rows.slice(0, MAX_SLICES - 1);
          const rest = rows.slice(MAX_SLICES - 1);
          const slices = top.map((r) => ({
            id: String(r.category_id ?? 'none'),
            value: num(r.total),
            label: r.category_id == null ? 'Uncategorised' : r.category || 'Unknown',
            color: categoryColor(r.category_id, categories, theme.palette.mode, r.color),
          }));
          if (rest.length) slices.push({ id: 'other', value: rest.reduce((s, r) => s + num(r.total), 0), label: 'Other', color: REST_COLOR });
          return (
            <Stack direction={{ xs: 'column', sm: 'row', md: 'column', xl: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
              <Box sx={{ position: 'relative', width: 200, height: 200, flex: 'none' }}>
                <PieChart
                  width={200}
                  height={200}
                  hideLegend
                  margin={0}
                  series={[{ data: slices, innerRadius: 64, outerRadius: 96, paddingAngle: 1.5, cornerRadius: 4, valueFormatter: (item) => `${money(item.value)} · ${percent(total ? item.value / total : 0)}` }]}
                />
                <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <Typography variant="caption" color="text.secondary">Total</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(total)}</Typography>
                </Stack>
              </Box>
              <Stack spacing={1} sx={{ width: '100%', minWidth: 0 }} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {slices.map((s) => (
                  <Stack component="li" key={s.id} direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 14 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: s.color, flex: 'none' }} />
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(s.value)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ width: 36, textAlign: 'right' }}>{percent(total ? s.value / total : 0)}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          );
        }}
      </QueryState>
    </Panel>
  );
}

function DailySpendChart({ month }) {
  const theme = useTheme();
  const dataProvider = useDataProvider();
  const query = useQuery({ queryKey: ['daily', month], queryFn: () => dataProvider.getDailySpend(month) });
  const start = parseDate(month);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

  return (
    <Panel title="Daily spending" subtitle={formatMonth(month)}>
      <QueryState query={query} height={240} empty="No spending this month.">
        {(rows) => {
          const byDay = new Map(rows.map((r) => [parseDate(r.txn_date).getDate(), num(r.spend)]));
          const labels = Array.from({ length: days }, (_, i) => i + 1);
          const values = labels.map((d) => byDay.get(d) ?? 0);
          const average = values.reduce((s, v) => s + v, 0) / days;
          return (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Average {money(average)} a day · highest {money(Math.max(...values))}
              </Typography>
              <BarChart
                height={300}
                borderRadius={3}
                grid={{ horizontal: true }}
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                hideLegend
                xAxis={[{ scaleType: 'band', data: labels, categoryGapRatio: 0.25, tickLabelInterval: (v) => v === 1 || v % 7 === 1 || v === days, valueFormatter: (d, ctx) => (ctx.location === 'tooltip' ? formatDate(`${month.slice(0, 8)}${String(d).padStart(2, '0')}`) : String(d)) }]}
                yAxis={[{ valueFormatter: (v) => compactMoney(v), width: 56 }]}
                series={[{ data: values, label: 'Spending', color: seriesColor(0, theme.palette.mode), valueFormatter: (v) => money(v) }]}
              />
            </>
          );
        }}
      </QueryState>
    </Panel>
  );
}

function useMonthTransactions(month) {
  const dataProvider = useDataProvider();
  return useQuery({
    queryKey: ['month-transactions', month],
    queryFn: async () => (await dataProvider.getList('transactions', { pagination: { page: 1, perPage: 1000 }, sort: { field: 'txn_date', order: 'DESC' }, filter: { month } })).data,
  });
}

function TopMerchants({ month, query }) {
  return (
    <Panel title="Top merchants" subtitle={`By spending, ${formatMonth(month)}`}>
      <QueryState query={query} height={240} empty="No spending this month." isEmpty={(rows) => !rows.some((r) => num(r.expense_amount) > 0)}>
        {(rows) => {
          const totals = new Map();
          for (const r of rows) {
            const spend = num(r.expense_amount);
            if (!spend) continue;
            const key = r.merchant_name || r.description;
            const t = totals.get(key) || { name: key, total: 0, count: 0, category_id: r.category_id, category: r.category, color: r.color };
            t.total += spend;
            t.count += 1;
            totals.set(key, t);
          }
          const top = [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 6);
          const max = top[0]?.total || 1;
          return (
            <Stack spacing={1.75}>
              {top.map((t) => (
                <Box key={t.name}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(t.total)}</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={(t.total / max) * 100} sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 3 } }} />
                  <Typography variant="caption" color="text.secondary">{t.count} {t.count === 1 ? 'payment' : 'payments'}{t.category ? ` · ${t.category}` : ''}</Typography>
                </Box>
              ))}
            </Stack>
          );
        }}
      </QueryState>
    </Panel>
  );
}

function RecentTransactions({ month, query }) {
  const navigate = useNavigate();
  return (
    <Panel title="Recent transactions" subtitle={formatMonth(month)} action={<Button size="small" onClick={() => navigate(transactionsLink({ month }))}>View all</Button>}>
      <QueryState query={query} height={240} empty="No transactions this month.">
        {(rows) => (
          <MuiList disablePadding>
            {rows.slice(0, 7).map((t) => (
              <ListItemButton key={t.id} onClick={() => navigate(transactionsLink({ month, q: t.merchant_name || '' }))} sx={{ px: 1, borderRadius: 2, gap: 1.5 }}>
                <ListItemText
                  primary={t.merchant_name || t.description}
                  secondary={<Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }} component="span"><span>{formatDate(t.txn_date)}</span><CategoryChip categoryId={t.category_id} name={t.category} color={t.color} /></Stack>}
                  slotProps={{ primary: { sx: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, secondary: { component: 'div' } }}
                  sx={{ minWidth: 0 }}
                />
                <Amount value={t.signed_amount} credit={t.direction === 'credit'} />
              </ListItemButton>
            ))}
          </MuiList>
        )}
      </QueryState>
    </Panel>
  );
}

export function Dashboard() {
  const monthsQuery = useMonths();
  const [index, setIndex] = useState(0); // 0 = latest month with data, not the calendar month
  const months = monthsQuery.data || [];
  const month = months[index]?.month;
  const txQuery = useMonthTransactions(month);
  const uncategorised = useMemo(() => months.reduce((s, m) => s + num(m.uncategorized_count), 0), [months]);
  const navigate = useNavigate();

  if (monthsQuery.isPending) {
    return (
      <Box sx={{ p: { xs: 0, sm: 1 } }}>
        <Skeleton width={240} height={48} />
        <Grid container spacing={2}>{[0, 1, 2, 3].map((i) => <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}><Skeleton variant="rounded" height={132} /></Grid>)}</Grid>
      </Box>
    );
  }
  if (monthsQuery.isError) {
    return (
      <Card sx={{ p: 4, textAlign: 'center', mt: 2 }} role="alert">
        <Typography color="error" sx={{ mb: 2 }}>{navigator.onLine ? 'Could not load your data.' : 'You are offline.'}</Typography>
        <Button variant="contained" onClick={() => monthsQuery.refetch()}>Retry</Button>
      </Card>
    );
  }
  // Accounts that are not on the allow-list see no rows at all (RLS).
  if (!months.length) return isMock ? <Typography sx={{ p: 4 }}>No data yet.</Typography> : <Navigate to="/not-authorised" replace />;

  return (
    <Box sx={{ pb: 4, pt: { xs: 1, sm: 2 } }}>
      <Title title="Overview" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, mb: 2.5 }}>
        <Box>
          <Typography variant="h4" component="h1">Overview</Typography>
          <Typography color="text.secondary">Your household money at a glance</Typography>
        </Box>
        <MonthPicker months={months} index={index} onChange={setIndex} />
      </Stack>

      {uncategorised > 0 && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 3 }} action={<Button color="inherit" size="small" onClick={() => navigate('/review')}>Review</Button>}>
          {uncategorised} {uncategorised === 1 ? 'transaction needs' : 'transactions need'} a category.
        </Alert>
      )}

      <KpiRow months={months} index={index} />

      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 7, lg: 8 }}><CashFlowChart months={months} index={index} /></Grid>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}><CategoryDonut month={month} /></Grid>
        <Grid size={{ xs: 12, md: 7, lg: 8 }}><DailySpendChart month={month} /></Grid>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}><TopMerchants month={month} query={txQuery} /></Grid>
        <Grid size={12}><RecentTransactions month={month} query={txQuery} /></Grid>
      </Grid>
    </Box>
  );
}
