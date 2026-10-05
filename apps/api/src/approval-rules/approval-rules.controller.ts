import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse } from '@nestjs/swagger';
import type { ApprovalRule as ApprovalRuleRow } from '@prisma/client';
import { ApprovalRule, CreateApprovalRuleRequest } from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { rejectUnmatchedWrite } from '../tenancy/roles';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parseCreateApprovalRule } from './approval-rule-input';

function toApprovalRule(r: ApprovalRuleRow): ApprovalRule {
  return {
    id: r.id,
    companyId: r.companyId,
    thresholdMinor: r.thresholdMinor,
    requiredRole: r.requiredRole,
  };
}

/**
 * The company's approval rules. Every active member reads them (submitting evaluates them);
 * only admins add and delete. There is no update: a change is a delete plus a create.
 */
@Controller('approval-rules')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class ApprovalRulesController {
  constructor(private readonly db: TenantDb) {}

  /** Lowest threshold first. */
  @Get()
  async list(
    @CompanyScope() scope: CompanyRequestScope,
  ): Promise<ApprovalRule[]> {
    const rows = await this.db.run(scope, (tx) =>
      tx.approvalRule.findMany({ orderBy: { thresholdMinor: 'asc' } }),
    );
    return rows.map(toApprovalRule);
  }

  /** A second rule at the same threshold is refused with 409. */
  @Post()
  create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: CreateApprovalRuleRequest,
  ): Promise<ApprovalRule> {
    const input = parseCreateApprovalRule(body);
    return this.db
      .run(scope, async (tx) => {
        const row = await tx.approvalRule.create({
          data: { ...input, companyId: scope.companyId },
        });
        await writeAudit(tx, scope, {
          action: 'approval_rule.created',
          entityType: 'approval_rule',
          entityId: row.id,
          details: { ...input },
        });
        return toApprovalRule(row);
      })
      .catch(translateDbError);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.db
      .run(scope, async (tx) => {
        const before = await tx.approvalRule.findUnique({ where: { id } });
        const { count } = await tx.approvalRule.deleteMany({ where: { id } });
        if (!before || count === 0) return rejectUnmatchedWrite(tx, scope);
        await writeAudit(tx, scope, {
          action: 'approval_rule.deleted',
          entityType: 'approval_rule',
          entityId: id,
          details: {
            thresholdMinor: before.thresholdMinor,
            requiredRole: before.requiredRole,
          },
        });
      })
      .catch(translateDbError);
  }
}
