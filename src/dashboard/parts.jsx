// Building blocks for the dashboard: card shell with loading / empty / error states,
// KPI tile with sparkline and month-on-month delta.

import { Box, Button, Card, CardContent, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { percent } from '../format.js';

export function Panel({ title, subtitle, action, children, sx }) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', ...sx }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.25, p: 2, '&:last-child': { pb: 2 } }}>
        {(title || action) && (
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box>
              {title && <Typography variant="subtitle1" sx={{ fontWeight: 650 }}>{title}</Typography>}
              {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
            </Box>
            {action}
          </Stack>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

// Renders loading, error and empty states around a React Query result.
export function QueryState({ query, height = 220, empty = 'Nothing to show for this month.', isEmpty, children }) {
  if (query.isPending) return <Skeleton variant="rounded" height={height} />;
  if (query.isError) {
    return (
      <Stack sx={{ height, alignItems: 'center', justifyContent: 'center', gap: 1.5, textAlign: 'center' }} role="alert">
        <Typography color="error">{navigator.onLine ? 'Could not load this data.' : 'You are offline.'}</Typography>
        <Button variant="outlined" size="small" onClick={() => query.refetch()}>Retry</Button>
      </Stack>
    );
  }
  const data = query.data;
  if (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0) {
    return (
      <Stack sx={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Typography color="text.secondary">{empty}</Typography>
      </Stack>
    );
  }
  return children(data);
}

// change from previous to current, as a ratio; null when not meaningful.
export function delta(current, previous) {
  if (previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function DeltaChip({ value, goodWhenUp }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const good = up === goodWhenUp;
  return (
    <Chip
      size="small"
      icon={up ? <TrendingUpIcon /> : <TrendingDownIcon />}
      label={`${up ? '+' : ''}${percent(value)}`}
      color={good ? 'success' : 'error'}
      variant="outlined"
      sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 12 } }}
      title="Change from previous month"
    />
  );
}

export function KpiCard({ label, value, caption, trend, trendLabels, color, deltaValue, goodWhenUp = true, icon, valueFormatter, onClick }) {
  const theme = useTheme();
  return (
    <Card sx={{ height: '100%', cursor: onClick ? 'pointer' : 'default', transition: 'border-color .15s', '&:hover': onClick ? { borderColor: 'primary.main' } : undefined }} onClick={onClick}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            {icon}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{label}</Typography>
          </Stack>
          <DeltaChip value={deltaValue} goodWhenUp={goodWhenUp} />
        </Stack>
        <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 1, minHeight: 36 }}>
          <Typography variant="caption" color="text.secondary">{caption}</Typography>
          {trend && trend.length > 1 && (
            <Box sx={{ width: 96, height: 36, flex: 'none' }}>
              <SparkLineChart
                data={trend}
                xAxis={{ data: trendLabels, scaleType: 'point' }}
                height={36}
                width={96}
                curve="natural"
                baseline="min"
                showTooltip
                showHighlight
                color={color || theme.palette.primary.main}
                valueFormatter={valueFormatter}
              />
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
