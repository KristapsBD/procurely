import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse } from '@nestjs/swagger';
import {
  CostCenter,
  CreateCostCenterRequest,
  UpdateCostCenterRequest,
} from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import { ApiCompanyHeader } from '../contract/decorators';
import { requireString } from '../contract/input';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { rejectUnmatchedWrite } from '../tenancy/roles';
import { TenantDb } from '../tenancy/tenant-db.service';

@Controller('cost-centers')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class CostCentersController {
  constructor(private readonly db: TenantDb) {}

  @Get()
  list(@CompanyScope() scope: CompanyRequestScope): Promise<CostCenter[]> {
    return this.db.run(scope, (tx) =>
      tx.costCenter.findMany({ orderBy: { code: 'asc' } }),
    );
  }

  @Get(':id')
  async get(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CostCenter> {
    const row = await this.db.run(scope, (tx) =>
      tx.costCenter.findUnique({ where: { id } }),
    );
    if (!row) throw new NotFoundException();
    return row;
  }

  @Post()
  async create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: CreateCostCenterRequest,
  ): Promise<CostCenter> {
    const data = {
      code: requireString(body?.code, 'code'),
      name: requireString(body?.name, 'name'),
      companyId: scope.companyId,
    };
    return this.db
      .run(scope, async (tx) => {
        const row = await tx.costCenter.create({ data });
        await writeAudit(tx, scope, {
          action: 'cost_center.created',
          entityType: 'cost_center',
          entityId: row.id,
          details: { code: row.code, name: row.name },
        });
        return row;
      })
      .catch(translateDbError);
  }

  @Patch(':id')
  async update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCostCenterRequest,
  ): Promise<CostCenter> {
    const name = requireString(body?.name, 'name');
    return this.db
      .run(scope, async (tx) => {
        const before = await tx.costCenter.findUnique({ where: { id } });
        const { count } = await tx.costCenter.updateMany({
          where: { id },
          data: { name },
        });
        if (!before || count === 0) return rejectUnmatchedWrite(tx, scope);
        if (name !== before.name) {
          await writeAudit(tx, scope, {
            action: 'cost_center.renamed',
            entityType: 'cost_center',
            entityId: id,
            details: { code: before.code, from: before.name, to: name },
          });
        }
        return { ...before, name };
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
        const before = await tx.costCenter.findUnique({ where: { id } });
        const { count } = await tx.costCenter.deleteMany({ where: { id } });
        if (!before || count === 0) return rejectUnmatchedWrite(tx, scope);
        await writeAudit(tx, scope, {
          action: 'cost_center.deleted',
          entityType: 'cost_center',
          entityId: id,
          details: { code: before.code, name: before.name },
        });
      })
      .catch(translateDbError);
  }
}
