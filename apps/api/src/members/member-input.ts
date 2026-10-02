import { BadRequestException } from '@nestjs/common';
import {
  ROLES,
  type InviteMemberRequest,
  type Role,
  type UpdateMemberRequest,
} from '../contract/api.dto';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseRole(value: unknown): Role {
  if (!ROLES.includes(value as Role)) {
    throw new BadRequestException(`role must be one of ${ROLES.join(', ')}`);
  }
  return value as Role;
}

export interface InviteInput {
  email: string;
  name: string;
  role: Role;
}

export function parseInvite(body: Partial<InviteMemberRequest>): InviteInput {
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email)) throw new BadRequestException('email must be valid');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  return {
    email,
    name: name || email.split('@')[0],
    role: parseRole(body.role),
  };
}

export function parseUpdate(
  body: Partial<UpdateMemberRequest>,
): UpdateMemberRequest {
  const update: UpdateMemberRequest = {};
  if (body?.role !== undefined) update.role = parseRole(body.role);
  if (body?.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      throw new BadRequestException('active must be a boolean');
    }
    update.active = body.active;
  }
  if (Object.keys(update).length === 0) {
    throw new BadRequestException('role or active is required');
  }
  return update;
}
