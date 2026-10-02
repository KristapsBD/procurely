import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { RequestScope } from './request-scope';

/**
 * The only way request handlers touch the database. Each call is one transaction that
 * first sets the transaction-local current user and current company; the RLS policies
 * read those settings and check them against active memberships. Settings are local to
 * the transaction, so pooled connections never carry an identity to the next request.
 */
@Injectable()
export class TenantDb {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    scope: RequestScope,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT
        set_config('app.current_user_id', ${scope.personId}, true),
        set_config('app.current_company_id', ${scope.companyId ?? ''}, true)`;
      return work(tx);
    });
  }
}
