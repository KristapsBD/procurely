import type { Prisma } from '@prisma/client';

export type At = Date;

export interface LineSpec {
  catalogItemId: string;
  quantity: number;
}

export type SeedRole = 'REQUESTER' | 'APPROVER' | 'BUYER' | 'ADMIN';

export type Outcome =
  | { status: 'DRAFT' }
  | {
      status: 'CANCELLED';
      from: 'DRAFT' | 'SUBMITTED';
      submittedAt?: At;
      at: At;
    }
  | { status: 'SUBMITTED'; at: At }
  | {
      status: 'APPROVED' | 'REJECTED';
      at: At;
      decision?: { by: string; at: At; comment: string | null };
    };

export interface ReceiptSpec {
  id: string;
  by: string;
  at: At;
  lines: { position: number; quantity: number; note: string | null }[];
}

export interface OrderSpec {
  id: string;
  by: string;
  at: At;
  lines?: { catalogItemId: string; quantity: number; unitPriceMinor: number }[];
  receipts: ReceiptSpec[];
  closure?: { by: string; at: At };
}

export interface RequisitionHistory {
  id: string;
  companyId: string;
  requesterPersonId: string;
  costCenterCode: string | null;
  justification: string;
  lines: LineSpec[];
  createdAt: At;
  outcome: Outcome;
  order?: OrderSpec;
}

export interface ApprovalRuleSeed {
  id: string;
  companyId: string;
  thresholdMinor: number;
  requiredRole: 'APPROVER' | 'ADMIN';
  createdAt: At;
}

export interface MembershipSeed {
  companyId: string;
  personId: string;
  role: SeedRole;
  active: boolean;
}

export interface ReferenceAuditEvent {
  id?: string;
  at: At;
  companyId: string;
  actorPersonId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Prisma.InputJsonObject;
}

export interface SeedRows {
  companies: Prisma.CompanyCreateManyInput[];
  people: Prisma.PersonCreateManyInput[];
  memberships: Prisma.MembershipCreateManyInput[];
  costCenters: Prisma.CostCenterCreateManyInput[];
  suppliers: Prisma.SupplierCreateManyInput[];
  catalogItems: Prisma.CatalogItemCreateManyInput[];
  approvalRules: Prisma.ApprovalRuleCreateManyInput[];
  requisitions: Prisma.RequisitionCreateManyInput[];
  requisitionLines: Prisma.RequisitionLineCreateManyInput[];
  requisitionDecisions: Prisma.RequisitionDecisionCreateManyInput[];
  purchaseOrders: Prisma.PurchaseOrderCreateManyInput[];
  purchaseOrderLines: Prisma.PurchaseOrderLineCreateManyInput[];
  goodsReceipts: Prisma.GoodsReceiptCreateManyInput[];
  goodsReceiptLines: Prisma.GoodsReceiptLineCreateManyInput[];
  purchaseOrderClosures: Prisma.PurchaseOrderClosureCreateManyInput[];
  pushDevices: Prisma.PushDeviceCreateManyInput[];
  auditLog: Prisma.AuditLogCreateManyInput[];
}

export interface Reference {
  companies: Prisma.CompanyCreateManyInput[];
  people: Prisma.PersonCreateManyInput[];
  memberships: MembershipSeed[];
  costCenters: { companyId: string; code: string; name: string }[];
  suppliers: Prisma.SupplierCreateManyInput[];
  catalogItems: (Prisma.CatalogItemCreateManyInput & { id: string })[];
  approvalRules: ApprovalRuleSeed[];
  pushDevices: {
    companyId: string;
    personId: string;
    token: string;
    updatedAt: At;
  }[];
  audit: ReferenceAuditEvent[];
}
