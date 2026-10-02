import type { components } from './generated/api';

/**
 * Client types for the HTTP API, generated from the API's own contract (apps/api/openapi.json).
 * Do not hand-write request or response shapes here: change the DTO classes in
 * apps/api/src/contract/api.dto.ts and run `pnpm contract:generate`. CI fails when the committed
 * generated types differ from what the API would generate.
 */
type Schemas = components['schemas'];

export type { components, operations, paths } from './generated/api';

export type Role = Schemas['Role'];
export type HealthResponse = Schemas['HealthResponse'];
export type Person = Schemas['Person'];
export type DevLoginRequest = Schemas['DevLoginRequest'];
export type SessionResponse = Schemas['SessionResponse'];
export type CompanyMembership = Schemas['CompanyMembership'];
export type MeResponse = Schemas['MeResponse'];
export type CostCenter = Schemas['CostCenter'];
export type CreateCostCenterRequest = Schemas['CreateCostCenterRequest'];
export type UpdateCostCenterRequest = Schemas['UpdateCostCenterRequest'];
export type Member = Schemas['Member'];
export type InviteMemberRequest = Schemas['InviteMemberRequest'];
export type UpdateMemberRequest = Schemas['UpdateMemberRequest'];
export type AuditEntry = Schemas['AuditEntry'];

/** Request header naming the company the person is acting in. */
export const COMPANY_HEADER = 'x-company-id';
