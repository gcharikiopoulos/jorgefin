import { Box } from '@mui/material';

// Column head that sorts its table. `sort` is { field, order } (or null for the
// table's natural order); clicking a new column uses `first` (text columns read
// best A→Z, figures biggest first), clicking again flips it.
export function SortTh({ field, sort, onSort, first = 'DESC', sx, title, children }) {
  const on = sort?.field === field;
  const next = on ? (sort.order === 'DESC' ? 'ASC' : 'DESC') : first;
  return (
    <Box component="th" aria-sort={on ? (sort.order === 'ASC' ? 'ascending' : 'descending') : 'none'} title={title} sx={{ ...sx, p: 0 }}>
      <Box component="button" type="button" onClick={() => onSort({ field, order: next })}
        sx={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', height: '100%', px: sx?.px ?? 1.5, pl: sx?.pl, pr: sx?.pr, cursor: 'pointer', textAlign: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'cockpit.tx' : 'inherit', '&:hover': { color: 'cockpit.tx' }, '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 } }}>
        {children}
        {on && <Box component="span" aria-hidden sx={{ ml: 0.5 }}>{sort.order === 'ASC' ? '▴' : '▾'}</Box>}
      </Box>
    </Box>
  );
}

// Client-side sort for small tables. `get` maps a field to a value getter;
// empty values always go last.
export function sortRows(rows, sort, get = {}) {
  if (!sort) return rows;
  const value = get[sort.field] || ((r) => r[sort.field]);
  const dir = sort.order === 'ASC' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || x === '') return y == null || y === '' ? 0 : 1;
    if (y == null || y === '') return -1;
    return (typeof x === 'string' ? x.localeCompare(y, 'el', { sensitivity: 'base' }) : x - y) * dir;
  });
}
