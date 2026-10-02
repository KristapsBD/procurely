import type { CompanyMembership, CostCenter } from '@procurely/shared-types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '../api/client';
import { queryKeys } from '../api/query-keys';
import { useApi, useSession } from '../session/session';

/** Null once signed out, so a screen still mounted for a render cannot fetch without a session. */
function useToken(): string | null {
  const { state } = useSession();
  return state.status === 'signedIn' ? state.token : null;
}

/** The API no longer accepts the token (expired): sign out, which returns to the login screen. */
export function useSignOutWhenUnauthorized(error: unknown): boolean {
  const { signOut } = useSession();
  const unauthorized = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauthorized) void signOut();
  }, [unauthorized, signOut]);
  return unauthorized;
}

function required(token: string | null): string {
  if (!token) throw new Error('Not signed in');
  return token;
}

export function useCompanies() {
  const api = useApi();
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.companies,
    queryFn: () => api.companies(required(token)),
    enabled: token !== null,
  });
}

/**
 * The company the person is acting in: their pick if it is still one of their companies,
 * otherwise the first. Null while loading or when they belong to none.
 */
export function pickActiveCompany(
  companies: CompanyMembership[],
  selectedCompanyId: string | null,
): CompanyMembership | null {
  return (
    companies.find((c) => c.companyId === selectedCompanyId) ??
    companies[0] ??
    null
  );
}

export function useCostCenters(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<CostCenter[]>({
    queryKey: queryKeys.costCenters(companyId),
    queryFn: () => api.costCenters(required(token), companyId),
    enabled: token !== null,
  });
}
