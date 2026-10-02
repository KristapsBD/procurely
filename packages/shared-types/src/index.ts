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

/** Request header naming the company the person is acting in. */
export const COMPANY_HEADER = 'x-company-id';
