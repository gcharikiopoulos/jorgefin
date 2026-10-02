// Building blocks for the cockpit dashboard: panel shell with loading / empty / error
// states, small-caps labels, key-figure tiles with mini bars, warning lights.

import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { labelSx, monoSx } from '../theme.js';
import { percent } from '../format.js';
import { TOUCH } from '../components/dense.js';

export const Label = ({ children, sx, ...rest }) => <Box component="span" sx={{ ...labelSx, ...sx }} {...rest}>{children}</Box>;
export const Mono = ({ children, sx, component = 'span', ...rest }) => <Box component={component} sx={{ ...monoSx, ...sx }} {...rest}>{children}</Box>;

export const Kbd = ({ children }) => (
  <Box component="kbd" sx={{ ...monoSx, fontSize: 10.5, color: 'cockpit.tx3', border: 1, borderColor: 'cockpit.line2', borderBottomWidth: 2, borderRadius: '2px', px: '4px', lineHeight: '14px', [TOUCH]: { display: 'none' } }}>{children}</Box>
);

// Panel with a 24px header strip: shortcut number, title, qualifier, and right-hand readouts.
export function Panel({ id, num, title, meta, right, children, sx, bodySx }) {
  return (
    <Box id={id} component="section" tabIndex={-1} sx={{ bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px', minWidth: 0, display: 'flex', flexDirection: 'column', outline: 'none', '&:focus-visible': { borderColor: 'primary.main' }, ...sx }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: 34, px: 1.5, borderBottom: 1, borderColor: 'cockpit.line', flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {num != null && <Kbd>{num}</Kbd>}
        <Label component="h2" sx={{ color: 'cockpit.tx', m: 0 }}>{title}</Label>
        {meta && <Label>{meta}</Label>}
        <Box sx={{ flexGrow: 1 }} />
        {right}
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0, ...bodySx }}>{children}</Box>
    </Box>
  );
}

// Renders loading, error and empty states around a React Query result.
export function QueryState({ query, height = 160, empty = 'Nothing to show for this month.', isEmpty, children }) {
  if (query.isPending) return <Skeleton variant="rectangular" height={height} sx={{ m: 1 }} />;
  if (query.isError) {
    return (
      <Stack sx={{ height, alignItems: 'center', justifyContent: 'center', gap: 1, textAlign: 'center' }} role="alert">
        <Typography variant="body2" color="error">{navigator.onLine ? 'Could not load this data.' : 'You are offline.'}</Typography>
        <Button variant="outlined" onClick={() => query.refetch()}>Retry</Button>
      </Stack>
    );
  }
  const data = query.data;
  if (isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0) {
    return (
      <Stack sx={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">{empty}</Typography>
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

export const signedPercent = (v) => (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '±') + percent(Math.abs(v), 1);

// Tone for a change: good, bad or flat. goodWhenUp says which direction is good.
export function tone(value, goodWhenUp = true) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.0005) return 'cockpit.tx3';
  return (value > 0) === goodWhenUp ? 'cockpit.pos' : 'cockpit.neg';
}

// Twelve little bars, the last one in the accent colour, with a dashed average line.
export function MiniBars({ values, width = 76, height = 30, showAverage = true }) {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const h = (v) => 18 + ((v - lo) / (hi - lo || 1)) * 82;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return (
    <Box sx={{ position: 'relative', display: { xs: 'none', sm: 'flex' }, alignItems: 'flex-end', gap: '2px', width, height, flex: 'none' }} aria-hidden>
      {values.map((v, i) => (
        <Box key={i} sx={{ flex: '1 1 0', height: `${h(v)}%`, borderRadius: '1px', bgcolor: i === values.length - 1 ? 'primary.main' : 'cockpit.line2' }} />
      ))}
      {showAverage && <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: `${h(avg)}%`, borderTop: 1, borderStyle: 'dashed', borderColor: 'cockpit.tx3' }} />}
    </Box>
  );
}

// Key figure: label, change from last month, big value, mini bars, average / low / high.
export function KpiTile({ label, value, unit, valueColor, deltaText, deltaColor, series, format, onClick, footer }) {
  const stats = series && series.length > 1
    ? { avg: series.reduce((s, v) => s + v, 0) / series.length, lo: Math.min(...series), hi: Math.max(...series) }
    : null;
  return (
    <Box
      component={onClick ? 'button' : 'div'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      sx={{ font: 'inherit', color: 'inherit', textAlign: 'left', bgcolor: 'cockpit.panel', border: 1, borderColor: 'cockpit.line', borderRadius: '3px', p: { xs: '10px 12px', md: '10px 12px' }, display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0, cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { borderColor: 'cockpit.line2' } : undefined }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, width: '100%' }}>
        <Label>{label}</Label>
        <Box sx={{ flexGrow: 1 }} />
        {deltaText && <Mono sx={{ fontSize: 11.5, fontWeight: 600, color: deltaColor }} title="Change from previous month">{deltaText}</Mono>}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'flex-end', gap: 1, width: '100%' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Mono sx={{ fontSize: { xs: 20, sm: 22 }, fontWeight: 600, letterSpacing: '-0.02em', color: valueColor }}>{value}</Mono>
          {unit && <Mono sx={{ fontSize: 11.5, color: 'cockpit.tx3', ml: '3px' }}>{unit}</Mono>}
        </Box>
        <MiniBars values={series} />
      </Stack>
      {footer || (stats && format && (
        <Mono sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.75, width: '100%', fontSize: 11, overflow: 'hidden', '& > span:nth-of-type(2)': { display: { xs: 'none', xl: 'inline' } }, '& > span:nth-of-type(3)': { display: { xs: 'none', sm: 'inline' } }, color: 'cockpit.tx3', borderTop: 1, borderStyle: 'dashed', borderColor: 'cockpit.line', pt: 0.5, whiteSpace: 'nowrap', '& b': { color: 'cockpit.tx2', fontWeight: 400 } }}>
          <span>AVG <b>{format(stats.avg)}</b></span>
          <span>LO <b>{format(stats.lo)}</b></span>
          <span>HI <b>{format(stats.hi)}</b></span>
        </Mono>
      ))}
    </Box>
  );
}

const LIGHT = { warn: 'cockpit.warn', ok: 'cockpit.pos', info: 'primary.main', off: 'cockpit.line2' };

// One warning light. Level: warn | ok | info | off. Lights with nothing to say stay dark.
export function Light({ label, detail, level = 'off', onClick }) {
  return (
    <Box
      component={onClick ? 'button' : 'div'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={`${label}: ${detail}`}
      sx={{ font: 'inherit', textAlign: 'left', display: { xs: level === 'off' ? 'none' : 'flex', sm: 'flex' }, alignItems: 'center', gap: '8px', height: { xs: 44, sm: 38 }, px: 1.25, minWidth: 0, borderRadius: '2px', border: 1, borderColor: 'cockpit.line', bgcolor: level === 'warn' ? 'cockpit.warnBg' : 'cockpit.panel', cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { borderColor: 'cockpit.line2' } : undefined }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: '1px', flex: 'none', bgcolor: LIGHT[level], opacity: level === 'off' ? 1 : 0.85 }} />
      <Box sx={{ minWidth: 0, lineHeight: 1.15 }}>
        <Mono component="div" sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: level === 'off' ? 'cockpit.tx3' : 'cockpit.tx2' }}>{label}</Mono>
        <Mono component="div" sx={{ fontSize: 10.5, color: 'cockpit.tx3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</Mono>
      </Box>
    </Box>
  );
}

// Horizontal gridlines with labels on the right, for the hand-drawn charts.
export function GridLines({ ticks, max, format }) {
  return ticks.map((t) => (
    <Box key={t} sx={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / max) * 100}%`, borderTop: 1, borderColor: 'cockpit.line' }}>
      <Mono sx={{ position: 'absolute', right: -44, top: -8, width: 40, fontSize: 11, color: 'cockpit.tx3' }}>{format(t)}</Mono>
    </Box>
  ));
}

// Round tick values for an axis from 0 to about max.
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return { ticks: [0], top: 1 };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  return { ticks, top };
}
