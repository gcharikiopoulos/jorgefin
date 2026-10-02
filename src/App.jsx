import { Admin, CustomRoutes, Resource } from 'react-admin';
import { Route } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { dataProvider } from './dataProvider.js';
import { authProvider } from './authProvider.js';
import { lightTheme, darkTheme } from './theme.js';
import { Layout } from './Layout.jsx';
import { LoginPage } from './LoginPage.jsx';
import { NotAuthorised } from './NotAuthorised.jsx';
import { Dashboard } from './dashboard/Dashboard.jsx';
import { TransactionList } from './transactions/TransactionList.jsx';
import { ReviewList } from './review/ReviewList.jsx';
import { CategoryList } from './categories/CategoryList.jsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: (count, error) => count < 2 && !error?.status } },
});

export function App() {
  return (
    <Admin
      title="Finance"
      dataProvider={dataProvider}
      authProvider={authProvider}
      queryClient={queryClient}
      dashboard={Dashboard}
      layout={Layout}
      loginPage={LoginPage}
      theme={lightTheme}
      lightTheme={lightTheme}
      darkTheme={darkTheme}
      requireAuth
      disableTelemetry
    >
      <Resource name="transactions" list={TransactionList} options={{ label: 'Transactions' }} />
      <Resource name="review" list={ReviewList} options={{ label: 'Review' }} />
      <Resource name="categories" list={CategoryList} options={{ label: 'Categories' }} recordRepresentation="name" />
      <CustomRoutes noLayout>
        <Route path="/not-authorised" element={<NotAuthorised />} />
      </CustomRoutes>
    </Admin>
  );
}
