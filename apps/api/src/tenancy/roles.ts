import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import type { CompanyRequestScope } from './request-scope';

/** Who may change suppliers and catalog items (mirrors the row-level security policies). */
export const PURCHASING_ROLES: readonly Role[] = ['BUYER', 'ADMIN'];

/**
 * Call when a write matched no rows. Row-level security hides rows the person may not
 * change, so "nothing matched" means no such row or not allowed. A member of the company
 * whose role may not write this record (`writers`, admins by default) gets 403 (they are
 * allowed to know the company exists); a writer, or someone with no active membership there,
 * gets 404, which never reveals whether a row of a company they do not belong to exists.
 */
export async function rejectUnmatchedWrite(
  tx: Prisma.TransactionClient,
  scope: CompanyRequestScope,
  writers: readonly Role[] = ['ADMIN'],
): Promise<never> {
  const own = await tx.membership.findFirst({
    where: {
      companyId: scope.companyId,
      personId: scope.personId,
      active: true,
    },
  });
  throw own && !writers.includes(own.role)
    ? new ForbiddenException('Not allowed for your role in this company')
    : new NotFoundException();
}
