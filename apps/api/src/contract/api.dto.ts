import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The request and response shapes of the HTTP API. This file is the source of the published
 * contract: `pnpm contract:generate` turns the controllers and these classes into
 * `apps/api/openapi.json` and the client types in `packages/shared-types/src/generated/api.ts`,
 * which `@procurely/shared-types` re-exports. Edit shapes here, never in the generated files.
 */

export const ROLES = ['REQUESTER', 'APPROVER', 'BUYER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export class HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ enum: ['up'] })
  database!: 'up';
}

export class Person {
  id!: string;
  email!: string;
  name!: string;
}

/** Dev-only login: signs in as any seeded person by id. */
export class DevLoginRequest {
  personId!: string;
}

/** The ways of signing in this API offers. */
export class AuthOptions {
  /** The dev-only login (development and test configurations only). */
  devLogin!: boolean;
  /** Google sign-in, when it is configured. */
  google!: boolean;
}

/** Redeems the handoff code from the Google callback with the app's PKCE code verifier. */
export class GoogleSessionRequest {
  code!: string;
  codeVerifier!: string;
}

export class SessionResponse {
  /** Bearer token for the Authorization header. */
  token!: string;
  person!: Person;
}

export class CompanyMembership {
  companyId!: string;
  companyName!: string;
  currency!: string;
  @ApiProperty({ enum: ROLES, enumName: 'Role' })
  role!: Role;
}

export class MeResponse extends Person {
  /** Active memberships only. Empty for a person who belongs to no company. */
  @ApiProperty({ type: [CompanyMembership] })
  memberships!: CompanyMembership[];
}

export class CostCenter {
  id!: string;
  companyId!: string;
  code!: string;
  name!: string;
}

export class CreateCostCenterRequest {
  code!: string;
  name!: string;
}

export class UpdateCostCenterRequest {
  name!: string;
}

/** A person's membership of the company they act in, as an admin sees it. */
export class Member {
  /** The membership id (not the person id). */
  id!: string;
  personId!: string;
  email!: string;
  name!: string;
  @ApiProperty({ enum: ROLES, enumName: 'Role' })
  role!: Role;
  active!: boolean;
}

/**
 * Invites a person by email. The person record is created if the email is new. A later Google
 * sign-in with that email links to it when Google is authoritative for the address (Gmail or
 * Google Workspace). No email is sent.
 */
export class InviteMemberRequest {
  email!: string;
  /** Display name for a new person; defaults to the part of the email before the @. */
  @ApiPropertyOptional()
  name?: string;
  @ApiProperty({ enum: ROLES, enumName: 'Role' })
  role!: Role;
}

export class UpdateMemberRequest {
  @ApiPropertyOptional({ enum: ROLES, enumName: 'Role' })
  role?: Role;
  @ApiPropertyOptional()
  active?: boolean;
}

export class AuditEntry {
  id!: string;
  actorPersonId!: string;
  action!: string;
  entityType!: string;
  @ApiProperty({ type: String, nullable: true })
  entityId!: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Free-form details of the action; null when there are none.',
  })
  details!: unknown;
  /** ISO 8601 timestamp. */
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** A company the business buys from. Inactive suppliers cannot be chosen for new work. */
export class Supplier {
  id!: string;
  companyId!: string;
  name!: string;
  active!: boolean;
}

export class CreateSupplierRequest {
  name!: string;
}

/** Rename, deactivate or reactivate a supplier. Suppliers are never deleted. */
export class UpdateSupplierRequest {
  @ApiPropertyOptional()
  name?: string;
  @ApiPropertyOptional()
  active?: boolean;
}

/** Something the company buys from one of its suppliers at an agreed price. */
export class CatalogItem {
  id!: string;
  companyId!: string;
  supplierId!: string;
  supplierName!: string;
  /** False when the supplier was deactivated: the item cannot be chosen for new work. */
  supplierActive!: boolean;
  name!: string;
  /** Agreed unit price in integer minor units of the company currency (cents, öre). */
  unitPriceMinor!: number;
}

export class CreateCatalogItemRequest {
  /** An active supplier of the same company. */
  supplierId!: string;
  name!: string;
  /** Integer minor units of the company currency, zero or more. */
  unitPriceMinor!: number;
}

export class UpdateCatalogItemRequest {
  /** Moving an item to another supplier requires that supplier to be active. */
  @ApiPropertyOptional()
  supplierId?: string;
  @ApiPropertyOptional()
  name?: string;
  @ApiPropertyOptional()
  unitPriceMinor?: number;
}

export const REQUISITION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'CANCELLED',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_ACTIONS = ['edit', 'submit', 'cancel'] as const;
export type RequisitionAction = (typeof REQUISITION_ACTIONS)[number];

export class RequisitionLine {
  id!: string;
  catalogItemId!: string;
  catalogItemName!: string;
  /** A whole number, 1 or more. */
  quantity!: number;
  /** Copied from the catalog item when the requisition was saved, in integer minor units. */
  unitPriceMinor!: number;
  /** quantity times unitPriceMinor. */
  amountMinor!: number;
}

/** A request to buy catalog items, charged to a cost center. Only the requester changes it. */
export class Requisition {
  id!: string;
  companyId!: string;
  requesterPersonId!: string;
  requesterName!: string;
  /** Null while a draft has no cost center yet. */
  @ApiProperty({ type: String, nullable: true })
  costCenterId!: string | null;
  justification!: string;
  @ApiProperty({ enum: REQUISITION_STATUSES, enumName: 'RequisitionStatus' })
  status!: RequisitionStatus;
  @ApiProperty({ type: [RequisitionLine] })
  lines!: RequisitionLine[];
  /** Sum of the line amounts in integer minor units of the company currency. */
  totalMinor!: number;
  /**
   * What the signed-in person may do to it now. Submitting a draft can still be refused when
   * it is incomplete.
   */
  @ApiProperty({
    enum: REQUISITION_ACTIONS,
    enumName: 'RequisitionAction',
    isArray: true,
  })
  actions!: RequisitionAction[];
}

export class RequisitionLineInput {
  catalogItemId!: string;
  /** A whole number, 1 or more. */
  quantity!: number;
}

/**
 * A whole draft: creates one, or replaces a draft's cost center, justification and lines. A
 * draft may be incomplete; submitting needs a cost center, a justification and a line.
 */
export class SaveRequisitionRequest {
  @ApiProperty({ type: String, nullable: true })
  costCenterId!: string | null;
  /** May be empty in a draft. */
  justification!: string;
  /** Items of active suppliers. The unit prices are taken from the catalog. */
  @ApiProperty({ type: [RequisitionLineInput] })
  lines!: RequisitionLineInput[];
}
