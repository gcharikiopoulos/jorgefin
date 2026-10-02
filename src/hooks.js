// Shared queries. React Query caches them, so every screen reuses one fetch.

import { useDataProvider } from 'react-admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useCategories() {
  const dataProvider = useDataProvider();
  return useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () => (await dataProvider.getList('categories', { pagination: { page: 1, perPage: 500 }, sort: { field: 'sort_order', order: 'ASC' }, filter: {} })).data,
    staleTime: 5 * 60_000,
  });
}

// v_monthly_summary rows, newest first.
export function useMonths() {
  const dataProvider = useDataProvider();
  return useQuery({ queryKey: ['monthly-summary'], queryFn: () => dataProvider.getMonthlySummary() });
}

// Refreshes everything that depends on categories after a write.
export function useRefreshAfterWrite() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
