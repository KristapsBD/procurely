import type { Query, QueryKey } from '@tanstack/react-query';

/**
 * Every company-scoped query is keyed `['company', companyId, ...]`, so data fetched in one
 * company can never be read back under another, and a company switch can drop it by key.
 */
export const queryKeys = {
  companies: ['companies'] as const,
  costCenters: (companyId: string) =>
    ['company', companyId, 'cost-centers'] as const,
};

export const cache = {
  belongsToOtherCompany(query: Query, companyId: string): boolean {
    const key: QueryKey = query.queryKey;
    return key[0] === 'company' && key[1] !== companyId;
  },
};
