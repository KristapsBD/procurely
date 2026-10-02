import type { CompanyMembership, CostCenter } from '@procurely/shared-types';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/query-keys';
import { useApi, useSession } from '../session/session';

function useToken(): string {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('Not signed in');
  return state.token;
}

export function useCompanies() {
  const api = useApi();
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.companies,
    queryFn: () => api.companies(token),
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
    queryFn: () => api.costCenters(token, companyId),
  });
}
