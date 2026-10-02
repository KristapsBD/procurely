import type { Prisma } from '@prisma/client';
import type { CompanyRequestScope } from '../tenancy/request-scope';

export interface AuditEntryInput {
  /** Dotted verb, e.g. "member.invited". */
  action: string;
  entityType: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Appends one audit entry as the acting person in the acting company. Call it inside the
 * same TenantDb.run as the change it records, so the entry commits or rolls back with it.
 *
 * It uses createMany on purpose: that is a plain INSERT without RETURNING, and RETURNING
 * would need the select policy, which only admins pass. Any active member may append.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  scope: CompanyRequestScope,
  entry: AuditEntryInput,
): Promise<void> {
  await tx.auditLog.createMany({
    data: [
      {
        companyId: scope.companyId,
        actorPersonId: scope.personId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
      },
    ],
  });
}
