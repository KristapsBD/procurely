import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Api } from './api/client';
import type { PushRegistrar } from './push/registrar';
import { SessionProvider } from './session/session';
import type { TokenStore } from './session/token-store';

export function AppProviders(props: {
  api: Api;
  store: TokenStore;
  /** Told before sign-out so the phone stops receiving the person's notifications. */
  push?: Pick<PushRegistrar, 'unregister'>;
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
      <SessionProvider api={props.api} store={props.store} push={props.push}>
        {props.children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
