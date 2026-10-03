// The calm overview: how this month is going, where the money went, how the balance
// moves, and the latest transactions. Every other chart lives on the Reports page.

import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, IconButton, Skeleton, Stack, Typography } from '@mui/material';
import { Title } from 'react-admin';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useCategories, useMonths } from '../hooks.js';
import { num } from '../backend.js';
import { amount, formatDayMonth, formatMonth, signedAmount, txnName } from '../format.js';
import { BalanceChart, EmptyOrDenied, avg, rollup, thisMonth, transactionsLink, useBalance, useBreakdown, useMonthTransactions } from './Dashboard.jsx';

const SHOWN_CATEGORIES = 9;
const AVERAGE_MONTHS = 6;

const cardSx = { bgcolor: 'cockpit.panel', borderRadius: '14px', p: { xs: 2.5, md: 3 }, minWidth: 0 };
const figureSx = { fontVariantNumeric: 'tabular-nums' };
const euro = (v) => `${amount(v)} €`;

function Card({ title, link, children, sx, ...rest }) {
  return (
    <Box component="section" sx={{ ...cardSx, ...sx }} {...rest}>
      {(title || link) && (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mb: 1.5 }}>
          {title && <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>{title}</Typography>}
          {link}
        </Stack>
      )}
      {children}
    </Box>
  );
}

function TextLink({ to, children, sx }) {
  return <Box component={RouterLink} to={to} sx={{ color: 'primary.main', fontSize: 14, fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, ...sx }}>{children}</Box>;
}

function MonthSwitch({ months, index, onChange }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center' }}>
      <IconButton aria-label="Previous month" onClick={() => onChange(index + 1)} disabled={index >= months.length - 1} sx={{ width: 44, height: 44 }}><ChevronLeftIcon /></IconButton>
      <Typography sx={{ minWidth: { xs: 120, sm: 150 }, textAlign: 'center', fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{formatMonth(months[index].month)}</Typography>
      <IconButton aria-label="Next month" onClick={() => onChange(index - 1)} disabled={index <= 0} sx={{ width: 44, height: 44 }}><ChevronRightIcon /></IconButton>
    </Stack>
  );
}

function Figure({ label, value, note, valueColor, noteColor }) {
  return (
    <Box sx={{ ...cardSx, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography sx={{ fontSize: 14, color: 'cockpit.tx3' }}>{label}</Typography>
      <Typography sx={{ ...figureSx, fontSize: { xs: 21, sm: 28, md: 32 }, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.15, whiteSpace: 'nowrap', color: valueColor }}>{value}</Typography>
      {note && <Typography sx={{ fontSize: 14, color: noteColor || 'cockpit.tx3' }}>{note}</Typography>}
    </Box>
  );
}

function Figures({ months, index }) {
  const m = months[index];
  const month = m.month;
  const balance = useBalance();
  const spent = num(m.expenses), income = num(m.income), net = num(m.net);
  const earlier = months.slice(index + 1, index + 1 + AVERAGE_MONTHS).map((r) => num(r.expenses));
  const average = earlier.length ? avg(earlier) : null;
  let spentNote = null, spentColor;
  if (average) {
    if (month === thisMonth()) spentNote = `So far · an average month is ${euro(average)}`;
    else {
      const d = (spent - average) / average;
      spentNote = `${Math.abs(Math.round(d * 100))}% ${d <= 0 ? 'below' : 'above'} your average (${euro(average)})`;
      spentColor = d <= 0 ? 'cockpit.pos' : 'cockpit.neg';
    }
  }
  const b = (balance.data || []).find((r) => r.month === month);
  return (
    <Box component="section" aria-label="This month" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
      <Figure label="Spent" value={euro(spent)} note={spentNote} noteColor={spentColor} />
      <Figure label="Income" value={euro(income)} />
      <Figure label="Net" value={`${signedAmount(net)} €`} valueColor={net < 0 ? 'cockpit.neg' : undefined} note={net < 0 ? 'Spent more than came in' : 'Kept this month'} />
      <Figure label="Total balance" value={b ? euro(b.balance) : '—'} note={b ? `Cash ${euro(b.cash)} · saved ${euro(b.saved)}` : null} />
    </Box>
  );
}

function ReviewBanner({ count, total }) {
  if (!count) return null;
  return (
    <Box component={RouterLink} to="/review" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px 16px', px: 2.5, py: 1.75, borderRadius: '12px', bgcolor: 'cockpit.warnBg', border: 1, borderColor: 'cockpit.warn', color: 'cockpit.warn', textDecoration: 'none', fontSize: 15 }}>
      <span><b>{count} transaction{count === 1 ? '' : 's'}</b> this month {count === 1 ? 'has' : 'have'} no category ({euro(total)}), so the totals are incomplete.</span>
      <Box component="span" sx={{ fontWeight: 600 }}>Review ›</Box>
    </Box>
  );
}

function WhereItWent({ month, spent }) {
  const { data: categories = [] } = useCategories();
  const query = useBreakdown(month);
  if (query.isPending) return <Skeleton variant="rounded" height={320} />;
  const groups = [...rollup(query.data || [], categories).values()].filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  const shown = groups.slice(0, SHOWN_CATEGORIES);
  const rest = groups.slice(SHOWN_CATEGORIES).reduce((s, g) => s + g.total, 0);
  const rows = [
    ...shown.map((g) => ({ key: g.category_id ?? 'none', label: g.label, total: g.total, uncat: g.category_id == null, to: transactionsLink({ month, category_id: g.category_id ?? 'none' }) })),
    ...(rest > 0 ? [{ key: 'rest', label: 'Everything else', total: rest, rest: true, to: '/reports' }] : []),
  ];
  const max = Math.max(...rows.map((r) => r.total), 1);
  if (!rows.length) return <Typography sx={{ color: 'cockpit.tx3', py: 4, textAlign: 'center' }}>No spending this month.</Typography>;
  return (
    <Box>
      {rows.map((r) => (
        <Box key={r.key} component={RouterLink} to={r.to}
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 6.5em 3em', alignItems: 'center', columnGap: 2, rowGap: 1, py: 1.5, px: 1, mx: -1, borderRadius: '8px', color: 'cockpit.tx', textDecoration: 'none', minHeight: 44, '&:hover': { bgcolor: 'cockpit.panel2' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, mb: 1, color: r.uncat ? 'cockpit.warn' : undefined, fontStyle: r.uncat ? 'italic' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</Typography>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'cockpit.panel2' }}>
              <Box sx={{ height: 6, borderRadius: 3, width: `${Math.max(2, (r.total / max) * 100)}%`, bgcolor: r.uncat ? 'cockpit.warn' : r.rest ? 'cockpit.line2' : 'primary.main' }} />
            </Box>
          </Box>
          <Typography sx={{ ...figureSx, fontSize: 15, fontWeight: 600, textAlign: 'right' }}>{euro(r.total)}</Typography>
          <Typography sx={{ ...figureSx, fontSize: 13, color: 'cockpit.tx3', textAlign: 'right' }}>{spent ? `${Math.round((r.total / spent) * 100)}%` : ''}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function BalanceLegend({ month }) {
  const balance = useBalance();
  const b = (balance.data || []).find((r) => r.month === month);
  if (!b) return null;
  const item = (color, label, v) => (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, fontSize: 14 }}>
      <Box sx={{ width: 14, height: 3, borderRadius: 2, bgcolor: color }} />
      <span>{label}</span>
      <Box component="b" sx={{ ...figureSx, ml: 'auto', fontWeight: 600 }}>{euro(v)}</Box>
    </Stack>
  );
  return (
    <Stack sx={{ gap: 0.75, mt: 1 }}>
      {item('cockpit.pos', 'Savings & investments', b.saved)}
      {item('primary.main', 'Cash', b.cash)}
    </Stack>
  );
}

function Latest({ query }) {
  if (query.isPending) return <Skeleton variant="rounded" height={220} />;
  const rows = (query.data || []).slice(0, 5);
  if (!rows.length) return <Typography sx={{ color: 'cockpit.tx3', py: 2 }}>No transactions this month.</Typography>;
  return rows.map((t) => {
    const v = num(t.signed_amount);
    return (
      <Stack key={t.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1.25, borderTop: 1, borderColor: 'cockpit.line' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txnName(t).name}</Typography>
          <Typography sx={{ fontSize: 13, color: 'cockpit.tx3' }}>{formatDayMonth(t.txn_date)} · {t.category_id == null ? 'Uncategorised' : t.category}</Typography>
        </Box>
        <Typography sx={{ ...figureSx, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', color: v > 0 ? 'cockpit.pos' : undefined }}>{signedAmount(v)} €</Typography>
      </Stack>
    );
  });
}

export function Overview() {
  const monthsQuery = useMonths();
  const [index, setIndex] = useState(0); // 0 = latest month with data
  const months = monthsQuery.data || [];
  const month = months[index]?.month;
  const txQuery = useMonthTransactions(month);

  if (monthsQuery.isPending) {
    return (
      <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}</Box>
        <Skeleton variant="rounded" height={360} />
      </Box>
    );
  }
  if (monthsQuery.isError) {
    return (
      <Box sx={{ ...cardSx, mt: 3, textAlign: 'center' }} role="alert">
        <Typography color="error" sx={{ mb: 1.5 }}>{navigator.onLine ? 'Could not load your data.' : 'You are offline.'}</Typography>
        <Button variant="contained" onClick={() => monthsQuery.refetch()}>Retry</Button>
      </Box>
    );
  }
  if (!months.length) return <EmptyOrDenied />;

  const m = months[index];
  const uncatRows = (txQuery.data || []).filter((r) => r.category_id == null);
  const uncatTotal = uncatRows.reduce((s, r) => s + Math.abs(num(r.signed_amount)), 0);
  return (
    <Box sx={{ maxWidth: 1200, width: '100%', mx: 'auto', pt: { xs: 1.5, md: 3 }, pb: 4, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 } }}>
      <Title title="Overview" />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography component="h1" sx={{ fontSize: 22, fontWeight: 600 }}>Overview</Typography>
        <MonthSwitch months={months} index={index} onChange={setIndex} />
      </Stack>

      <ReviewBanner count={num(m.uncategorized_count)} total={uncatTotal} />
      <Figures months={months} index={index} />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 2, md: 3 }, alignItems: 'flex-start' }}>
        <Card title="Where the money went" link={<TextLink to="/reports">Month details ›</TextLink>} sx={{ flex: '999 1 520px' }}>
          <WhereItWent month={month} spent={num(m.expenses)} />
        </Card>
        <Box sx={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 } }}>
          <Card title="Balance">
            <Typography sx={{ fontSize: 14, color: 'cockpit.tx3', mt: -1, mb: 1 }}>Last 12 months · investments at what you put in</Typography>
            <Box sx={{ mx: -1.5 }}><BalanceChart month={month} legend={false} /></Box>
            <BalanceLegend month={month} />
          </Card>
          <Card title="Latest" link={<TextLink to={transactionsLink({ month })}>All transactions ›</TextLink>}>
            <Latest query={txQuery} />
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
