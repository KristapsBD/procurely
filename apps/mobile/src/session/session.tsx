import type { Person, SessionResponse } from '@procurely/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Api } from '../api/client';
import { ApiError } from '../api/client';
import { isOtherCompanyQuery } from '../api/query-keys';
import type { PushRegistrar } from '../push/registrar';
import type { TokenStore } from './token-store';

type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; token: string; person: Person };

interface Session {
  state: SessionState;
  /** The company the person picked; null until they pick one (the first is used meanwhile). */
  selectedCompanyId: string | null;
  /** Dev login as a seeded person. */
  signIn(personId: string): Promise<void>;
  /** Adopts a session the API issued (Google sign-in). */
  startSession(session: SessionResponse): Promise<void>;
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
  push?: Pick<PushRegistrar, 'unregister'>;
  children: ReactNode;
}) {
  const { api, store, push } = props;
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );

  // Restore a saved session. Only a token the API rejects (expired) is dropped; when the API
  // cannot be reached the token is kept for the next launch.
  useEffect(() => {
    let cancelled = false;
    const settle = (next: SessionState) => {
      if (!cancelled) setState(next);
    };
    void (async () => {
      const token = await store.load();
      if (!token) return settle({ status: 'signedOut' });
      try {
        const me = await api.me(token);
        const person = { id: me.id, email: me.email, name: me.name };
        settle({ status: 'signedIn', token, person });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await store.clear();
        }
        settle({ status: 'signedOut' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, store]);

  const startSession = useCallback(
    async ({ token, person }: SessionResponse) => {
      await store.save(token);
      // A new person never inherits what the previous one fetched, nor a late response for it.
      await queryClient.cancelQueries();
      queryClient.clear();
      setSelectedCompanyId(null);
      setState({ status: 'signedIn', token, person });
    },
    [store, queryClient],
  );

  const signIn = useCallback(
    async (personId: string) => startSession(await api.devLogin(personId)),
    [api, startSession],
  );

  const signOut = useCallback(async () => {
    const current = stateRef.current;
    if (current.status === 'signedIn') await push?.unregister(current.token);
    await store.clear();
    await queryClient.cancelQueries();
    queryClient.clear();
    setSelectedCompanyId(null);
    setState({ status: 'signedOut' });
  }, [store, queryClient, push]);

  const selectCompany = useCallback(
    (companyId: string) => {
      // Drop (and stop in-flight fetches of) every other company's data, so nothing from the
      // company just left can be rendered, even briefly. Queries are also keyed by company.
      queryClient.removeQueries({
        predicate: (query) => isOtherCompanyQuery(query, companyId),
      });
      setSelectedCompanyId(companyId);
    },
    [queryClient],
  );

  const session = useMemo(
    () => ({
      state,
      selectedCompanyId,
      signIn,
      startSession,
      signOut,
      selectCompany,
    }),
    [state, selectedCompanyId, signIn, startSession, signOut, selectCompany],
  );

  return (
    <ApiContext.Provider value={api}>
      <SessionContext.Provider value={session}>
        {props.children}
      </SessionContext.Provider>
    </ApiContext.Provider>
  );
}
