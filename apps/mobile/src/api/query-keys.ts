import type { Query, QueryKey } from '@tanstack/react-query';

/**
 * Every company-scoped query is keyed `['company', companyId, ...]`, so data fetched in one
 * company can never be read back under another, and a company switch can drop it by key.
 */
export const queryKeys = {
  authOptions: ['auth-options'] as const,
  companies: ['companies'] as const,
  /** Everything of one company: a write invalidates it all (a renamed supplier shows in the catalog). */
  company: (companyId: string) => ['company', companyId] as const,
  costCenters: (companyId: string) =>
    ['company', companyId, 'cost-centers'] as const,
  suppliers: (companyId: string, selectable: boolean) =>
    ['company', companyId, 'suppliers', { selectable }] as const,
  catalogItems: (companyId: string) =>
    ['company', companyId, 'catalog-items'] as const,
  requisitions: (companyId: string) =>
    ['company', companyId, 'requisitions'] as const,
  members: (companyId: string) => ['company', companyId, 'members'] as const,
};

export function isOtherCompanyQuery(query: Query, companyId: string) {
  const key: QueryKey = query.queryKey;
  return key[0] === 'company' && key[1] !== companyId;
}
