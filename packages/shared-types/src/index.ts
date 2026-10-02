export interface HealthResponse {
  status: 'ok';
  database: 'up';
}

export type Role = 'REQUESTER' | 'APPROVER' | 'BUYER' | 'ADMIN';

export interface Person {
  id: string;
  email: string;
  name: string;
}

/** Dev-only login: signs in as any seeded person by id. */
export interface DevLoginRequest {
  personId: string;
}

export interface SessionResponse {
  /** Bearer token for the Authorization header. */
  token: string;
  person: Person;
}

export interface CompanyMembership {
  companyId: string;
  companyName: string;
  currency: string;
  role: Role;
}

export interface MeResponse extends Person {
  /** Active memberships only. Empty for a person who belongs to no company. */
  memberships: CompanyMembership[];
}

export interface CostCenter {
  id: string;
  companyId: string;
  code: string;
  name: string;
}

export interface CreateCostCenterRequest {
  code: string;
  name: string;
}

export interface UpdateCostCenterRequest {
  name: string;
}

/** A person's membership of the company they act in, as an admin sees it. */
export interface Member {
  /** The membership id (not the person id). */
  id: string;
  personId: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

/**
 * Invites a person by email. The person record is created if the email is new, so a later
 * Google sign-in with that email finds it. No email is sent.
 */
export interface InviteMemberRequest {
  email: string;
  /** Display name for a new person; defaults to the part of the email before the @. */
  name?: string;
  role: Role;
}

export interface UpdateMemberRequest {
  role?: Role;
  active?: boolean;
}

export interface AuditEntry {
  id: string;
  actorPersonId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  createdAt: string;
}

/** Request header naming the company the person is acting in. */
export const COMPANY_HEADER = 'x-company-id';
