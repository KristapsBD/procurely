import type { Person } from '@procurely/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Api } from '../api/client';
import { cache } from '../api/query-keys';
import type { TokenStore } from './token-store';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; token: string; person: Person };

interface Session {
  state: SessionState;
  /** The company the person picked; null until they pick one (the first is used meanwhile). */
  selectedCompanyId: string | null;
  signIn(personId: string): Promise<void>;
  signOut(): Promise<void>;
  selectCompany(companyId: string): void;
}

const SessionContext = createContext<Session | null>(null);
const ApiContext = createContext<Api | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession needs a SessionProvider');
  return session;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi needs a SessionProvider');
  return api;
}

export function SessionProvider(props: {
  api: Api;
  store: TokenStore;
  children: ReactNode;
}) {
  const { api, store } = props;
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );

  // Restore a saved session; a token the API no longer accepts (expired) is dropped.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await store.load();
      if (!token) return cancelled || setState({ status: 'signedOut' });
      try {
        const me = await api.me(token);
        const person = { id: me.id, email: me.email, name: me.name };
        if (!cancelled) setState({ status: 'signedIn', token, person });
      } catch {
        await store.clear();
        if (!cancelled) setState({ status: 'signedOut' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, store]);

  const signIn = useCallback(
    async (personId: string) => {
      const { token, person } = await api.devLogin(personId);
      await store.save(token);
      // A new person never inherits what the previous one fetched.
      queryClient.clear();
      setSelectedCompanyId(null);
      setState({ status: 'signedIn', token, person });
    },
    [api, store, queryClient],
  );

  const signOut = useCallback(async () => {
    await store.clear();
    queryClient.clear();
    setSelectedCompanyId(null);
    setState({ status: 'signedOut' });
  }, [store, queryClient]);

  const selectCompany = useCallback(
    (companyId: string) => {
      // Drop (and stop in-flight fetches of) every other company's data, so nothing from the
      // company just left can be rendered, even briefly. Queries are also keyed by company.
      queryClient.removeQueries({
        predicate: (query) => cache.belongsToOtherCompany(query, companyId),
      });
      setSelectedCompanyId(companyId);
    },
    [queryClient],
  );

  const session = useMemo(
    () => ({ state, selectedCompanyId, signIn, signOut, selectCompany }),
    [state, selectedCompanyId, signIn, signOut, selectCompany],
  );

  return (
    <ApiContext.Provider value={api}>
      <SessionContext.Provider value={session}>
        {props.children}
      </SessionContext.Provider>
    </ApiContext.Provider>
  );
}
