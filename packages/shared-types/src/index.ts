/**
 * Client types for the HTTP API, generated from the API's own contract (apps/api/openapi.json):
 * `paths`, `operations`, `components` and one alias per schema (`Member`, `CostCenter`, ...).
 * Do not hand-write request or response shapes here: change the DTO classes in
 * apps/api/src/contract/api.dto.ts and run `pnpm contract:generate`. CI fails when the committed
 * generated types differ from what the API would generate.
 */
export type * from './generated/api';

/** Request header naming the company the person is acting in. */
export const COMPANY_HEADER = 'x-company-id';
