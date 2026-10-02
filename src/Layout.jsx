import { Badge, Chip, Typography } from '@mui/material';
import { AppBar, Layout as RaLayout, Menu, TitlePortal } from 'react-admin';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import RuleIcon from '@mui/icons-material/RuleOutlined';
import CategoryIcon from '@mui/icons-material/CategoryOutlined';
import { isMock, num } from './backend.js';
import { useMonths } from './hooks.js';
import { OfflineBanner } from './OfflineBanner.jsx';

function ReviewIcon() {
  const { data: months = [] } = useMonths();
  const count = months.reduce((s, m) => s + num(m.uncategorized_count), 0);
  return (
    <Badge badgeContent={count} color="error" max={99} invisible={!count}>
      <RuleIcon />
    </Badge>
  );
}

function AppMenu() {
  return (
    <Menu>
      <Menu.DashboardItem primaryText="Overview" leftIcon={<DashboardIcon />} />
      <Menu.Item to="/transactions" primaryText="Transactions" leftIcon={<ReceiptIcon />} />
      <Menu.Item to="/review" primaryText="Review" leftIcon={<ReviewIcon />} />
      <Menu.Item to="/categories" primaryText="Categories" leftIcon={<CategoryIcon />} />
    </Menu>
  );
}

function AppHeader() {
  return (
    <AppBar color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mr: 1.5 }}>Finance</Typography>
      {isMock && <Chip size="small" color="warning" label="Demo" sx={{ mr: 1 }} />}
      <TitlePortal variant="body1" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'block' } }} />
    </AppBar>
  );
}

export function Layout({ children }) {
  return (
    <RaLayout menu={AppMenu} appBar={AppHeader}>
      <OfflineBanner />
      {children}
    </RaLayout>
  );
}
