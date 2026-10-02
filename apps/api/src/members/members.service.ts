import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Member, UpdateMemberRequest } from '@procurely/shared-types';
import { writeAudit } from '../audit/audit-log';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { rejectUnmatchedWrite } from '../tenancy/roles';
import type { InviteInput } from './member-input';

type Tx = Prisma.TransactionClient;
type MembershipWithPerson = Prisma.MembershipGetPayload<{
  include: { person: true };
}>;

function toMember(m: MembershipWithPerson): Member {
  return {
    id: m.id,
    personId: m.personId,
    email: m.person.email,
    name: m.person.name,
    role: m.role,
    active: m.active,
  };
}

/**
 * Membership management. Every method runs inside the caller's TenantDb.run, so the
 * change and its audit entry share one transaction, and row-level security decides
 * who may do what: only admins of the current company can invite or update.
 */
@Injectable()
export class MembersService {
  async list(tx: Tx, scope: CompanyRequestScope): Promise<Member[]> {
    const rows = await tx.membership.findMany({
      where: { companyId: scope.companyId },
      include: { person: true },
      orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }],
    });
    return rows.map(toMember);
  }

  /**
   * Invites a person by email: finds or creates the person, then adds the membership
   * (or reactivates a deactivated one with the new role). No email is sent.
   */
  async invite(
    tx: Tx,
    scope: CompanyRequestScope,
    input: InviteInput,
  ): Promise<Member> {
    const [{ id: personId }] = await tx.$queryRaw<{ id: string }[]>`
      SELECT invite_person(${input.email}, ${input.name}) AS id`;
    const existing = await tx.membership.findUnique({
      where: { companyId_personId: { companyId: scope.companyId, personId } },
    });
    if (existing?.active) {
      throw new ConflictException('Already an active member of this company');
    }
    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { role: input.role, active: true },
          include: { person: true },
        })
      : await tx.membership.create({
          data: { companyId: scope.companyId, personId, role: input.role },
          include: { person: true },
        });
    await writeAudit(tx, scope, {
      action: existing ? 'member.reactivated' : 'member.invited',
      entityType: 'membership',
      entityId: membership.id,
      details: { email: input.email, role: input.role },
    });
    return toMember(membership);
  }

  /** Changes a member's role and/or active flag. Deactivation takes effect on the next statement. */
  async update(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    change: UpdateMemberRequest,
  ): Promise<Member> {
    const current = await tx.membership.findFirst({
      where: { id, companyId: scope.companyId },
      include: { person: true },
    });
    if (!current) return rejectUnmatchedWrite(tx, scope);
    const role = change.role ?? current.role;
    const active = change.active ?? current.active;
    if (role === current.role && active === current.active) {
      return toMember(current);
    }
    await this.requireAnotherAdmin(tx, current, role, active);
    const { count } = await tx.membership.updateMany({
      where: { id },
      data: { role, active },
    });
    // A person can see their own membership but not change it: nothing matched.
    if (count === 0) return rejectUnmatchedWrite(tx, scope);
    await this.auditChange(tx, scope, current, role, active);
    return toMember({ ...current, role, active });
  }

  /** A company must always keep an active admin, or nobody could manage it again. */
  private async requireAnotherAdmin(
    tx: Tx,
    current: MembershipWithPerson,
    role: string,
    active: boolean,
  ): Promise<void> {
    const staysAdmin = role === 'ADMIN' && active;
    if (current.role !== 'ADMIN' || !current.active || staysAdmin) return;
    const others = await tx.membership.count({
      where: {
        companyId: current.companyId,
        role: 'ADMIN',
        active: true,
        id: { not: current.id },
      },
    });
    if (others === 0) {
      throw new ConflictException('A company needs at least one active admin');
    }
  }

  private async auditChange(
    tx: Tx,
    scope: CompanyRequestScope,
    before: MembershipWithPerson,
    role: MembershipWithPerson['role'],
    active: boolean,
  ): Promise<void> {
    const base = { entityType: 'membership', entityId: before.id };
    const email = before.person.email;
    if (role !== before.role) {
      await writeAudit(tx, scope, {
        ...base,
        action: 'member.role_changed',
        details: { email, from: before.role, to: role },
      });
    }
    if (active !== before.active) {
      await writeAudit(tx, scope, {
        ...base,
        action: active ? 'member.reactivated' : 'member.deactivated',
        details: { email },
      });
    }
  }
}
