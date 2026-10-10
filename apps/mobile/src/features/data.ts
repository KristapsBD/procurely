import type {
  ApprovalRule,
  CatalogItem,
  CompanyMembership,
  CostCenter,
  Member,
  PurchaseOrder,
  Requisition,
  Supplier,
} from '@procurely/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError, type Api } from '../api/client';
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

export function useSuppliers(companyId: string, opts: { selectable: boolean }) {
  const api = useApi();
  const token = useToken();
  return useQuery<Supplier[]>({
    queryKey: queryKeys.suppliers(companyId, opts.selectable),
    queryFn: () => api.suppliers(required(token), companyId, opts),
    enabled: token !== null,
  });
}

export function useCatalogItems(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<CatalogItem[]>({
    queryKey: queryKeys.catalogItems(companyId),
    queryFn: () => api.catalogItems(required(token), companyId),
    enabled: token !== null,
  });
}

export function useRequisitions(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<Requisition[]>({
    queryKey: queryKeys.requisitions(companyId),
    queryFn: () => api.requisitions(required(token), companyId),
    enabled: token !== null,
  });
}

export function usePurchaseOrders(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<PurchaseOrder[]>({
    queryKey: queryKeys.purchaseOrders(companyId),
    queryFn: () => api.purchaseOrders(required(token), companyId),
    enabled: token !== null,
  });
}

export function useApprovalRules(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<ApprovalRule[]>({
    queryKey: queryKeys.approvalRules(companyId),
    queryFn: () => api.approvalRules(required(token), companyId),
    enabled: token !== null,
  });
}

export function useMembers(companyId: string) {
  const api = useApi();
  const token = useToken();
  return useQuery<Member[]>({
    queryKey: queryKeys.members(companyId),
    queryFn: () => api.members(required(token), companyId),
    enabled: token !== null,
  });
}

/**
 * A change to a record of one company. On success every query of that company refetches,
 * because one change can show in several lists (a renamed supplier also names catalog items).
 */
export function useCompanyMutation<TInput, TResult = unknown>(
  companyId: string,
  write: (api: Api, token: string, input: TInput) => Promise<TResult>,
) {
  const api = useApi();
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => write(api, required(token), input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.company(companyId) }),
  });
}

/** What to tell the person when a change failed: the API's reason when it gave one. */
export function writeErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Your role in this company does not allow this change.';
  }
  if (error instanceof ApiError && error.status < 500) return error.message;
  return 'Could not save the change. Try again.';
}
