import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuditEntry } from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';

const PAGE_SIZE = 200;

@Controller('audit-log')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class AuditLogController {
  constructor(private readonly db: TenantDb) {}

  /** Newest first. Only admins of the company get rows; the database decides. */
  @Get()
  async list(
    @CompanyScope() scope: CompanyRequestScope,
  ): Promise<AuditEntry[]> {
    const rows = await this.db.run(scope, (tx) =>
      tx.auditLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
        take: PAGE_SIZE,
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      actorPersonId: r.actorPersonId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
