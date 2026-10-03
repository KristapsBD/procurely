import type {
  CompanyMembership,
  CostCenter,
  MeResponse,
  SessionResponse,
} from '@procurely/shared-types';
import { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Api } from '../api/client';
import { AppProviders } from '../app-providers';
import { useSession } from '../session/session';
import type { TokenStore } from '../session/token-store';

export const alice = { id: 'p-alice', email: 'alice@x.test', name: 'Alice' };

export function membership(
  companyId: string,
  companyName: string,
): CompanyMembership {
  return { companyId, companyName, currency: 'EUR', role: 'REQUESTER' };
}

export function costCenter(companyId: string, code: string): CostCenter {
  return { id: `${companyId}-${code}`, companyId, code, name: `${code} name` };
}

/** A promise the test settles by hand, to control when a response "arrives". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

export function fakeApi(overrides: Partial<Api> = {}): Api {
  const session: SessionResponse = { token: 'token-alice', person: alice };
  const me: MeResponse = { ...alice, memberships: [] };
  return {
    authOptions: async () => ({ devLogin: true, google: false }),
    devLogin: async () => session,
    googleStartUrl: (returnUrl, challenge) =>
      `http://api.test/auth/google/start?return_to=${returnUrl}&code_challenge=${challenge}`,
    googleSession: async () => session,
    me: async () => me,
    companies: async () => [],
    costCenters: async () => [],
    ...overrides,
  };
}

export function memoryStore(token: string | null = null): TokenStore {
  let saved = token;
  return {
    load: async () => saved,
    save: async (t) => void (saved = t),
    clear: async () => void (saved = null),
  };
}

/** Like the router's protected route: children render only once a session is restored. */
function WhenSignedIn(props: { children: ReactNode }) {
  const { state } = useSession();
  return state.status === 'signedIn' ? props.children : null;
}

/** Providers with a signed-in session restored from the store. */
export function TestApp(props: {
  api: Api;
  store?: TokenStore;
  children: ReactNode;
}) {
  return (
    <AppProviders
      api={props.api}
      store={props.store ?? memoryStore('token-alice')}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <WhenSignedIn>{props.children}</WhenSignedIn>
    </AppProviders>
  );
}
