import {
  BadRequestException,
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
import type {
  CostCenter,
  CreateCostCenterRequest,
  UpdateCostCenterRequest,
} from '@procurely/shared-types';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import { CompanyScope, type RequestScope } from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';

type CompanyRequestScope = RequestScope & { companyId: string };

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

@Controller('cost-centers')
@UseGuards(SessionGuard)
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
    @Body() body: Partial<CreateCostCenterRequest>,
  ): Promise<CostCenter> {
    const data = {
      code: requireString(body?.code, 'code'),
      name: requireString(body?.name, 'name'),
      companyId: scope.companyId,
    };
    return this.db
      .run(scope, (tx) => tx.costCenter.create({ data }))
      .catch(translateDbError);
  }

  @Patch(':id')
  async update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<UpdateCostCenterRequest>,
  ): Promise<CostCenter> {
    const name = requireString(body?.name, 'name');
    return this.db
      .run(scope, (tx) =>
        tx.costCenter.update({ where: { id }, data: { name } }),
      )
      .catch(translateDbError);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.db
      .run(scope, (tx) => tx.costCenter.delete({ where: { id } }))
      .catch(translateDbError);
  }
}
