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
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

/** What only the requester does to their requisition. */
export const REQUESTER_ACTIONS = ['edit', 'submit', 'cancel'] as const;
export type RequesterAction = (typeof REQUESTER_ACTIONS)[number];
/** What a decider (never the requester) does to a submitted requisition. */
export const DECISION_ACTIONS = ['approve', 'reject'] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];
export const REQUISITION_ACTIONS = [
  ...REQUESTER_ACTIONS,
  ...DECISION_ACTIONS,
] as const;
export type RequisitionAction = (typeof REQUISITION_ACTIONS)[number];

/** The roles an approval rule may require. Requesters and buyers never approve. */
export const APPROVER_ROLES = ['APPROVER', 'ADMIN'] as const;
export type ApproverRole = (typeof APPROVER_ROLES)[number];

/**
 * Who decides a requisition, fixed when it leaves DRAFT: an approver or an admin (an approver
 * rule), an admin (an admin rule), nobody because it was under every threshold and approved on
 * submit, or an admin because the company had no approval rules.
 */
export const APPROVAL_ROUTES = [
  'APPROVER',
  'ADMIN',
  'UNDER_THRESHOLD',
  'NO_RULES',
] as const;
export type ApprovalRoute = (typeof APPROVAL_ROUTES)[number];

/**
 * From thresholdMinor on (inclusive), requiredRole approves. A requisition follows the rule with
 * the greatest threshold at or below its total.
 */
export class ApprovalRule {
  id!: string;
  companyId!: string;
  /** Integer minor units of the company currency, zero or more. */
  thresholdMinor!: number;
  @ApiProperty({ enum: APPROVER_ROLES, enumName: 'ApproverRole' })
  requiredRole!: ApproverRole;
}

/** Thresholds are unique per company. To change a rule, delete it and create another. */
export class CreateApprovalRuleRequest {
  /** Integer minor units of the company currency, zero or more. */
  thresholdMinor!: number;
  @ApiProperty({ enum: APPROVER_ROLES, enumName: 'ApproverRole' })
  requiredRole!: ApproverRole;
}

export class ApproveRequisitionRequest {
  /** Shown to the requester. Optional; blank counts as none. */
  @ApiPropertyOptional()
  comment?: string;
}

export class RejectRequisitionRequest {
  /** Shown to the requester. Required, not blank. */
  reason!: string;
}

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

/**
 * A request to buy catalog items, charged to a cost center. Only the requester edits, submits
 * or cancels it; an approver or admin other than the requester approves or rejects it.
 */
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
  /** Null while a draft, and on a draft that was cancelled. */
  @ApiProperty({
    enum: APPROVAL_ROUTES,
    enumName: 'ApprovalRoute',
    nullable: true,
  })
  approvalRoute!: ApprovalRoute | null;
  /**
   * For the requester: the approver's comment, the rejection reason, or why the requisition was
   * approved automatically. Null when there is none.
   */
  @ApiProperty({ type: String, nullable: true })
  decisionNote!: string | null;
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

/** What a notification tells the app to open. Carries ids only, never names or amounts. */
export const PUSH_KINDS = [
  'approval-requested',
  'requisition-decided',
] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** Binds a phone to the person and the company they act in on it (the company header). */
export class RegisterPushDeviceRequest {
  /** The Expo push token, such as ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. */
  token!: string;
}

/** A notification the development outbox recorded for one of the person's own devices. */
export class PushOutboxEntry {
  id!: string;
  sentAt!: string;
  title!: string;
  body!: string;
  @ApiProperty({ enum: PUSH_KINDS, enumName: 'PushKind' })
  kind!: PushKind;
  requisitionId!: string;
  companyId!: string;
}

export class PurchaseOrderLine {
  id!: string;
  catalogItemId!: string;
  catalogItemName!: string;
  /** A whole number, 1 or more. */
  quantity!: number;
  /** Set by the buyer when the order was made, in integer minor units. */
  unitPriceMinor!: number;
  /** quantity times unitPriceMinor. */
  amountMinor!: number;
  /** Net quantity confirmed by goods receipts so far, 0 up to quantity. */
  receivedQuantity!: number;
}

export type PurchaseOrderStatus =
  'ISSUED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED';

/**
 * A buyer's order of an approved requisition from one supplier. Never changed afterwards. A
 * requisition becomes at most one purchase order.
 */
export class PurchaseOrder {
  id!: string;
  companyId!: string;
  requisitionId!: string;
  /** The requisition's justification, to recognise it by. */
  requisitionJustification!: string;
  supplierId!: string;
  supplierName!: string;
  createdByPersonId!: string;
  createdByName!: string;
  /** ISO 8601 timestamp. */
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: [PurchaseOrderLine] })
  lines!: PurchaseOrderLine[];
  /** Sum of the line amounts in integer minor units of the company currency. */
  totalMinor!: number;
  /**
   * Derived from the goods receipts: ISSUED until something is received, PARTIALLY_RECEIVED
   * while any line is short, FULLY_RECEIVED once every line is complete, CLOSED after a buyer
   * closes a fully received order.
   */
  @ApiProperty({
    enum: ['ISSUED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED'],
  })
  status!: PurchaseOrderStatus;
  /** ISO 8601 timestamp, null until the order is closed. */
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  closedAt!: string | null;
  closedByName!: string | null;
}

export class PurchaseOrderLineInput {
  /** An item of the chosen supplier. Each item may appear once. */
  catalogItemId!: string;
  /** A whole number, 1 or more. */
  quantity!: number;
  /** Integer minor units of the company currency, zero or more. */
  unitPriceMinor!: number;
}

/** Orders an approved requisition from an active supplier of the company. Buyers and admins only. */
export class CreatePurchaseOrderRequest {
  /** An approved requisition of the company that has no purchase order yet. */
  requisitionId!: string;
  /** An active supplier of the company. */
  supplierId!: string;
  /** At least one line. */
  @ApiProperty({ type: [PurchaseOrderLineInput] })
  lines!: PurchaseOrderLineInput[];
}

export class GoodsReceiptLine {
  id!: string;
  purchaseOrderLineId!: string;
  catalogItemName!: string;
  /** Positive for a delivery, negative for a correction of an earlier entry. */
  quantity!: number;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

/** One delivery confirmed against a purchase order. Recorded once, never edited or deleted. */
export class GoodsReceipt {
  id!: string;
  companyId!: string;
  purchaseOrderId!: string;
  receivedByPersonId!: string;
  receivedByName!: string;
  /** ISO 8601 timestamp. */
  @ApiProperty({ format: 'date-time' })
  receivedAt!: string;
  @ApiProperty({ type: [GoodsReceiptLine] })
  lines!: GoodsReceiptLine[];
}

export class GoodsReceiptLineInput {
  /** A line of this purchase order. Each line may appear once per receipt. */
  purchaseOrderLineId!: string;
  /**
   * A whole number, not zero. Positive confirms a delivery; negative corrects earlier entries
   * and needs a note. The line's net received quantity must stay between 0 and the ordered
   * quantity.
   */
  quantity!: number;
  /** Optional, up to 500 characters: damage, a shortfall, the reason for a correction. */
  @ApiProperty({ required: false, type: String })
  note?: string;
}

/** Confirms a delivery against order lines. Buyers and admins only; not on a closed order. */
export class CreateGoodsReceiptRequest {
  /** At least one line. */
  @ApiProperty({ type: [GoodsReceiptLineInput] })
  lines!: GoodsReceiptLineInput[];
}
