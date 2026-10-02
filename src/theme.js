// Light and dark "cockpit" themes: dense type, hairline panels, monospaced figures.
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
    bg: '#e9ecf0', panel: '#ffffff', panel2: '#f6f7f9', line: '#dfe3e8', line2: '#c7cdd5',
    tx: '#0e1116', tx2: '#3f4753', tx3: '#525b67',
    pos: '#0a7a36', neg: '#c42f2f', warn: '#8a6420', warnBg: 'rgba(222,150,20,0.05)',
    hatch: 'rgba(0,0,0,0.04)', out: '#9aa3ae', acc: '#2a78d6', accText: '#1c5cab',
  },
};

// Small caps label used for panel titles, column heads and readout keys.
export const labelSx = {
  fontFamily: mono,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: 'cockpit.tx3',
  lineHeight: 1.2,
};
export const monoSx = { fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"zero" 1' };

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
      fontSize: 12,
      htmlFontSize: 16,
      body1: { fontSize: 12.5 },
      body2: { fontSize: 12 },
      caption: { fontSize: 10.5, color: c.tx3 },
      button: { fontSize: 11.5, textTransform: 'none', fontWeight: 600 },
      h4: { fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' },
      h6: { fontWeight: 650, fontSize: 14 },
      subtitle1: { fontSize: 13, fontWeight: 600 },
      subtitle2: { fontSize: 12, fontWeight: 600 },
    },
    shape: { borderRadius: 3 },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundColor: c.bg, WebkitFontSmoothing: 'antialiased' } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: `1px solid ${c.line}`, boxShadow: 'none', borderRadius: 3 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' }, elevation1: { boxShadow: 'none' } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500, borderRadius: 2, height: 18, fontSize: 10.5 }, label: { paddingInline: 6 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.line, '&.MuiTableCell-sizeSmall': { padding: '3px 7px' } },
          head: { whiteSpace: 'nowrap', fontFamily: mono, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.tx3 },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiFormControl: { defaultProps: { size: 'small' } },
      MuiInputBase: { styleOverrides: { root: { fontSize: 12 } } },
      MuiButton: { defaultProps: { size: 'small', disableElevation: true }, styleOverrides: { root: { borderRadius: 3, minHeight: 26 } } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiListItemButton: { defaultProps: { dense: true } },
      MuiMenuItem: { defaultProps: { dense: true }, styleOverrides: { root: { fontSize: 12 } } },
      MuiToolbar: { styleOverrides: { dense: { minHeight: 38 }, regular: { minHeight: 38, '@media (min-width:600px)': { minHeight: 38 } } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 3, fontSize: 12 } } },
      RaLayout: { styleOverrides: { root: { '& .RaLayout-content': { paddingInline: 6, paddingTop: 0 }, '& .RaLayout-appFrame': { marginTop: 38 } } } },
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
