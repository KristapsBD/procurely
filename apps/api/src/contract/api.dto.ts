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
 * Invites a person by email. The person record is created if the email is new, so a later
 * Google sign-in with that email finds it. No email is sent.
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
