import type {
  CatalogItem,
  CompanyMembership,
  CostCenter,
  MeResponse,
  Role,
  SessionResponse,
  Supplier,
} from '@procurely/shared-types';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Api } from '../api/client';
import { AppProviders } from '../app-providers';
import { useSession } from '../session/session';
import type { TokenStore } from '../session/token-store';

export const alice = { id: 'p-alice', email: 'alice@x.test', name: 'Alice' };

export function membership(
  companyId: string,
  companyName: string,
  role: Role = 'REQUESTER',
): CompanyMembership {
  return { companyId, companyName, currency: 'EUR', role };
}

export function costCenter(companyId: string, code: string): CostCenter {
  return { id: `${companyId}-${code}`, companyId, code, name: `${code} name` };
}

export function supplier(
  companyId: string,
  name: string,
  active = true,
): Supplier {
  return { id: `${companyId}-${name}`, companyId, name, active };
}

export function catalogItem(
  s: Supplier,
  name: string,
  unitPriceMinor: number,
): CatalogItem {
  return {
    id: `${s.id}-${name}`,
    companyId: s.companyId,
    supplierId: s.id,
    supplierName: s.name,
    supplierActive: s.active,
    name,
    unitPriceMinor,
  };
}

/**
 * Presses a button that starts a write, and lets the write run before the test goes on. A plain
 * press followed by waitFor can starve the mutation's promise chain for seconds on a slow run.
 */
export async function pressToWrite(
  button: Parameters<typeof fireEvent.press>[0],
) {
  await act(async () => fireEvent.press(button));
}

/** A promise the test settles by hand, to control when a response "arrives". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Reads return nothing, writes fail unless a test provides them. */
export function fakeApi(overrides: Partial<Api> = {}): Api {
  const session: SessionResponse = { token: 'token-alice', person: alice };
  const me: MeResponse = { ...alice, memberships: [] };
  const notFaked = async (): Promise<never> => {
    throw new Error('not faked in this test');
  };
  return {
    devLogin: async () => session,
    me: async () => me,
    companies: async () => [],
    costCenters: async () => [],
    createCostCenter: notFaked,
    renameCostCenter: notFaked,
    deleteCostCenter: notFaked,
    suppliers: async () => [],
    createSupplier: notFaked,
    updateSupplier: notFaked,
    catalogItems: async () => [],
    createCatalogItem: notFaked,
    updateCatalogItem: notFaked,
    deleteCatalogItem: notFaked,
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
          // No garbage-collection timers: they would outlive the test and keep Jest running.
          defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { gcTime: Infinity },
          },
        })
      }
    >
      <WhenSignedIn>{props.children}</WhenSignedIn>
    </AppProviders>
  );
}
