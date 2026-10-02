// App shell: a 38px top bar with section tabs (bottom tabs on phones), no sidebar,
// and a status line along the bottom. "g" then o / t / r / c switches section.

import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppBar as MuiAppBar, Box, Stack, useMediaQuery } from '@mui/material';
import { Layout as RaLayout, LoadingIndicator, TitlePortal, ToggleThemeButton, UserMenu, Logout } from 'react-admin';
import { isMock, num } from './backend.js';
import { useMonths } from './hooks.js';
import { OfflineBanner } from './OfflineBanner.jsx';
import { Kbd, Label, Mono } from './dashboard/parts.jsx';
import { monoSx } from './theme.js';
import { version } from '../package.json';

const SECTIONS = [
  { to: '/', label: 'Overview', key: 'o', end: true },
  { to: '/transactions', label: 'Transactions', key: 't' },
  { to: '/review', label: 'Review', key: 'r', badge: 'review' },
  { to: '/categories', label: 'Categories', key: 'c' },
];

function useReviewCount() {
  const { data: months = [] } = useMonths();
  return months.reduce((s, m) => s + num(m.uncategorized_count), 0);
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

function useSectionKeys() {
  const navigate = useNavigate();
  useEffect(() => {
    let armed = 0;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'g') { armed = Date.now(); return; }
      if (Date.now() - armed < 1000) {
        const s = SECTIONS.find((x) => x.key === e.key);
        if (s) navigate(s.to);
        armed = 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

function ReviewBadge({ count }) {
  if (!count) return null;
  return <Mono sx={{ fontSize: 10, fontWeight: 700, color: 'cockpit.warn', border: 1, borderColor: 'cockpit.warn', borderRadius: '2px', px: '3px', lineHeight: '13px' }}>{count > 99 ? '99+' : count}</Mono>;
}

const tabSx = {
  display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, color: 'cockpit.tx2', textDecoration: 'none', fontSize: 12, whiteSpace: 'nowrap',
  '&:hover': { color: 'cockpit.tx' },
  '&.active': { color: 'cockpit.tx', fontWeight: 600, boxShadow: (t) => `inset 0 -2px 0 ${t.palette.primary.main}` },
};

function TopBar() {
  const reviewCount = useReviewCount();
  const online = useOnline();
  const small = useMediaQuery((t) => t.breakpoints.down('sm'));
  return (
    <MuiAppBar position="fixed" elevation={0} color="inherit" sx={{ height: 38, bgcolor: 'cockpit.panel', borderBottom: 1, borderColor: 'cockpit.line', backgroundImage: 'none' }}>
      <Stack direction="row" sx={{ height: 38, alignItems: 'center', gap: 1.5, px: 1.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.875 }}>
          <Box component="svg" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} sx={{ color: 'primary.main' }} aria-hidden>
            <path d="M2 12 L6 7 L9 9.5 L14 3" /><path d="M10.5 3 H14 V6.5" />
          </Box>
          <Mono sx={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.12em' }}>JORGEFIN</Mono>
          {isMock && <Mono sx={{ fontSize: 9, color: 'cockpit.warn', border: 1, borderColor: 'cockpit.warn', borderRadius: '2px', px: 0.5, lineHeight: '14px' }}>DEMO</Mono>}
        </Stack>
        {!small && (
          <Stack component="nav" aria-label="Sections" direction="row" sx={{ alignSelf: 'stretch', ml: 0.75 }}>
            {SECTIONS.map((s) => (
              <Box key={s.to} component={NavLink} to={s.to} end={s.end} sx={tabSx}>
                {s.label}
                {s.badge === 'review' && <ReviewBadge count={reviewCount} />}
              </Box>
            ))}
          </Stack>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'none' }}><TitlePortal /></Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, display: { xs: 'none', md: 'flex' } }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: online ? 'cockpit.pos' : 'cockpit.warn' }} />
          <Label>{online ? 'Online' : 'Offline'}</Label>
        </Stack>
        <LoadingIndicator />
        <ToggleThemeButton />
        <UserMenu><Logout /></UserMenu>
      </Stack>
    </MuiAppBar>
  );
}

function BottomTabs() {
  const reviewCount = useReviewCount();
  return (
    <Box component="nav" aria-label="Sections" sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, height: 52, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', bgcolor: 'cockpit.panel', borderTop: 1, borderColor: 'cockpit.line', pb: 'env(safe-area-inset-bottom)' }}>
      {SECTIONS.map((s) => (
        <Box key={s.to} component={NavLink} to={s.to} end={s.end}
          sx={{ ...monoSx, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'cockpit.tx3', textDecoration: 'none', '&.active': { color: 'cockpit.tx', fontWeight: 700, boxShadow: (t) => `inset 0 2px 0 ${t.palette.primary.main}` } }}>
          {s.label === 'Transactions' ? 'Ledger' : s.label}
          {s.badge === 'review' && <ReviewBadge count={reviewCount} />}
        </Box>
      ))}
    </Box>
  );
}

function StatusBar() {
  const online = useOnline();
  const { pathname } = useLocation();
  return (
    <Mono component="footer" sx={{ height: 22, display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.75, px: 1.5, mx: -0.75, mt: 'auto', borderTop: 1, borderColor: 'cockpit.line', bgcolor: 'cockpit.panel', fontSize: 9.5, color: 'cockpit.tx3', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <span><Box component="span" sx={{ color: online ? 'cockpit.pos' : 'cockpit.warn' }}>●</Box> {online ? 'ONLINE' : 'OFFLINE · CACHED'}</span>
      {isMock && <span>DEMO DATA</span>}
      <Box sx={{ flexGrow: 1 }} />
      {pathname === '/' && <span><Kbd>1</Kbd>–<Kbd>8</Kbd> panel</span>}
      <span><Kbd>G</Kbd> <Kbd>O</Kbd>/<Kbd>T</Kbd>/<Kbd>R</Kbd>/<Kbd>C</Kbd> section</span>
      <span>EUR · el-GR</span>
      <span>v{version}</span>
    </Mono>
  );
}

export function Layout({ children }) {
  useSectionKeys();
  const small = useMediaQuery((t) => t.breakpoints.down('sm'));
  return (
    <RaLayout appBar={TopBar} sidebar={() => null} sx={{ '& .RaLayout-content': { pb: small ? '60px' : 0, minHeight: 'calc(100vh - 38px)' } }}>
      <OfflineBanner />
      {children}
      <StatusBar />
      {small && <BottomTabs />}
    </RaLayout>
  );
}
