// Light and dark themes: React Admin's Radiant theme with a calmer finance palette.

import { radiantDarkTheme, radiantLightTheme } from 'react-admin';
import { deepmerge } from '@mui/utils';

const font = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Compact density: smaller base type, a narrower sidebar, tighter tables and inputs.
const shared = {
  sidebar: { width: 200, closedWidth: 56 },
  typography: {
    fontFamily: font,
    fontSize: 13,
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 650 },
    subtitle2: { fontWeight: 600 },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    // Radiant pads small cells by 10px through this selector; restate it to win.
    MuiTableCell: { styleOverrides: { root: { '&.MuiTableCell-sizeSmall': { padding: '5px 10px' } }, head: { whiteSpace: 'nowrap' } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiButton: { defaultProps: { size: 'small' } },
    MuiIconButton: { defaultProps: { size: 'small' } },
    MuiListItemButton: { defaultProps: { dense: true } },
    MuiMenuItem: { defaultProps: { dense: true } },
    MuiToolbar: { styleOverrides: { dense: { minHeight: 44 } } },
    RaLayout: { styleOverrides: { root: { '& .RaLayout-content': { paddingInline: 12 } } } },
  },
};

// Active menu item: a soft tint of the primary colour instead of Radiant's gradient.
const menuItem = (tint, ink, headerInk) => ({
  // Radiant bakes its purple into these; restate them with this palette.
  RaDatagrid: { styleOverrides: { root: { '& .RaDatagrid-headerCell': { color: headerInk, fontWeight: 600 }, '& .RaDatagrid-rowCell': { lineHeight: 1.35 } } } },
  MuiPaper: { styleOverrides: { elevation1: { boxShadow: 'none' } } },
  RaMenuItemLink: {
    styleOverrides: {
      root: {
        borderLeft: 'none',
        borderRadius: 10,
        marginInline: 8,
        '&:hover': { borderRadius: 10 },
        '&.RaMenuItemLink-active': {
          borderLeft: 'none',
          borderRadius: 10,
          backgroundImage: 'none',
          backgroundColor: tint,
          color: ink,
          boxShadow: 'none',
          fontWeight: 600,
          '& .MuiSvgIcon-root': { fill: ink },
        },
      },
    },
  },
});

export const lightTheme = deepmerge(radiantLightTheme, deepmerge(shared, {
  palette: {
    mode: 'light',
    primary: { main: '#2a78d6', light: '#5598e7', dark: '#1c5cab', contrastText: '#ffffff' },
    secondary: { main: '#1c5cab' },
    success: { main: '#0b8a3e' },
    error: { main: '#d03b3b' },
    background: { default: '#f6f7fb', paper: '#ffffff' },
    text: { primary: '#14161a', secondary: '#5b616e' },
    divider: '#e6e8ee',
  },
  components: {
    ...menuItem('rgba(42,120,214,0.10)', '#1c5cab', '#5b616e'),
    MuiCard: { styleOverrides: { root: { border: '1px solid #e6e8ee', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' } } },
  },
}));

export const darkTheme = deepmerge(radiantDarkTheme, deepmerge(shared, {
  palette: {
    mode: 'dark',
    primary: { main: '#5b9cf0', light: '#86b6ef', dark: '#256abf', contrastText: '#0b1530' },
    secondary: { main: '#86b6ef' },
    success: { main: '#2fbf62' },
    error: { main: '#ef6b6b' },
    background: { default: '#0f1115', paper: '#171a20' },
    text: { primary: '#f1f3f6', secondary: '#a3aab6' },
    divider: '#262a33',
  },
  components: {
    ...menuItem('rgba(91,156,240,0.16)', '#9ec5f4', '#a3aab6'),
    MuiCard: { styleOverrides: { root: { border: '1px solid #262a33', boxShadow: 'none' } } },
  },
}));
