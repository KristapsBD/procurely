import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CompanyRequestScope } from './request-scope';

/**
 * Call when a write matched no rows. Row-level security hides rows the person may not
 * change, so "nothing matched" means no such row or not allowed. A member of the company
 * whose role is not admin gets 403 (they are allowed to know the company exists); an admin,
 * or someone with no active membership there, gets 404, which never reveals whether a row
 * of a company they do not belong to exists.
 */
export async function rejectUnmatchedWrite(
  tx: Prisma.TransactionClient,
  scope: CompanyRequestScope,
): Promise<never> {
  const own = await tx.membership.findFirst({
    where: {
      companyId: scope.companyId,
      personId: scope.personId,
      active: true,
    },
  });
  throw own && own.role !== 'ADMIN'
    ? new ForbiddenException('Not allowed for your role in this company')
    : new NotFoundException();
}
