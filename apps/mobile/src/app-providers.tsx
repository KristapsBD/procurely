import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Api } from './api/client';
import { SessionProvider } from './session/session';
import type { TokenStore } from './session/token-store';

export function AppProviders(props: {
  api: Api;
  store: TokenStore;
  queryClient?: QueryClient;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      props.queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider api={props.api} store={props.store}>
        {props.children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
