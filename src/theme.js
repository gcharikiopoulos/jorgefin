// Light and dark themes: calm type, rounded borderless panels, tabular figures.
// (The palette still lives under palette.cockpit, a name kept from the first design.)
// Built on React Admin's Radiant theme; the extra colours live in palette.cockpit.

import { radiantDarkTheme, radiantLightTheme } from 'react-admin';
import { deepmerge } from '@mui/utils';

export const font = '"Commissioner Variable", system-ui, -apple-system, "Segoe UI", sans-serif';
export const mono = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';

// Colours beyond MUI's palette, read by the dashboard parts as theme.palette.cockpit.
const cockpit = {
  dark: {
    bg: '#08090c', panel: '#0e1115', panel2: '#13171c', line: '#1c2129', line2: '#2b323c',
    tx: '#e6eaf0', tx2: '#a9b2be', tx3: '#8d97a5',
    pos: '#3fd07a', neg: '#ff7d6e', warn: '#c9a25a', warnBg: 'rgba(201,162,90,0.05)',
    hatch: 'rgba(255,255,255,0.05)', out: '#6f7a89', acc: '#4c8fe8', accText: '#8dbaf3',
  },
  light: {
    bg: '#f2f2ef', panel: '#ffffff', panel2: '#f6f6f3', line: '#e6e6e1', line2: '#cfd1cb',
    tx: '#0e1116', tx2: '#3f4753', tx3: '#525b67',
    pos: '#0a7a36', neg: '#c42f2f', warn: '#8a6420', warnBg: 'rgba(222,150,20,0.05)',
    hatch: 'rgba(0,0,0,0.04)', out: '#9aa3ae', acc: '#2a78d6', accText: '#1c5cab',
  },
};

// Quiet label used for panel titles, column heads and readout keys.
export const labelSx = {
  fontFamily: font,
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0,
  color: 'cockpit.tx3',
  lineHeight: 1.3,
};
// Figures: the body font with tabular digits, so columns of amounts line up.
export const monoSx = { fontFamily: font, fontVariantNumeric: 'tabular-nums' };

function build(base, mode) {
  const c = cockpit[mode];
  return deepmerge(base, {
    sidebar: { width: 0, closedWidth: 0 },
    palette: {
      mode,
      cockpit: c,
      primary: { main: c.acc, contrastText: '#ffffff' },
      secondary: { main: c.accText },
      success: { main: c.pos },
      error: { main: c.neg },
      warning: { main: c.warn },
      background: { default: c.bg, paper: c.panel },
      text: { primary: c.tx, secondary: c.tx2, disabled: c.tx3 },
      divider: c.line,
      action: { hover: c.panel2 },
    },
    typography: {
      fontFamily: font,
      fontSize: 14,
      htmlFontSize: 16,
      body1: { fontSize: 15 },
      body2: { fontSize: 14 },
      caption: { fontSize: 12.5, color: c.tx3 },
      button: { fontSize: 14, textTransform: 'none', fontWeight: 600 },
      h4: { fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em' },
      h6: { fontWeight: 650, fontSize: 16 },
      subtitle1: { fontSize: 14.5, fontWeight: 600 },
      subtitle2: { fontSize: 13.5, fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundColor: c.bg, WebkitFontSmoothing: 'antialiased' } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: 'none', boxShadow: 'none', borderRadius: 14 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, elevation1: { boxShadow: 'none' } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: 6, height: 24, fontSize: 12.5 }, label: { paddingInline: 7 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.line, '&.MuiTableCell-sizeSmall': { padding: '6px 10px' } },
          head: { whiteSpace: 'nowrap', fontSize: 13, fontWeight: 500, color: c.tx3 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      MuiInputBase: { styleOverrides: { root: ({ theme }) => ({ fontSize: 14, [theme.breakpoints.down('sm')]: { fontSize: 16 } }) } },
      MuiButton: { defaultProps: { size: 'small', disableElevation: true }, styleOverrides: { root: ({ theme }) => ({ borderRadius: 8, minHeight: 36, [theme.breakpoints.down('sm')]: { minHeight: 44 } }) } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      
      MuiMenuItem: { styleOverrides: { root: ({ theme }) => ({ fontSize: 14, minHeight: 38, [theme.breakpoints.down('sm')]: { minHeight: 44, fontSize: 15 } }) } },
      MuiToolbar: { styleOverrides: { dense: { minHeight: 48 }, regular: { minHeight: 48, '@media (min-width:600px)': { minHeight: 48 } } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 10, fontSize: 14 } } },
      RaLayout: { styleOverrides: { root: { '& .RaLayout-content': { paddingInline: 10, paddingTop: 0 }, '& .RaLayout-appFrame': { marginTop: 48 } } } },
      RaDatagrid: {
        styleOverrides: {
          root: {
            '& .RaDatagrid-headerCell': { color: c.tx3, backgroundColor: c.panel },
            '& .RaDatagrid-rowCell': { lineHeight: 1.3 },
            '& .RaDatagrid-row:hover': { backgroundColor: c.panel2 },
          },
        },
      },
    },
  });
}

export const lightTheme = build(radiantLightTheme, 'light');
export const darkTheme = build(radiantDarkTheme, 'dark');
