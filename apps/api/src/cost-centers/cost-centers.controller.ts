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
import { ApiNoContentResponse } from '@nestjs/swagger';
import {
  CostCenter,
  CreateCostCenterRequest,
  UpdateCostCenterRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader, ApiSession } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { rejectUnmatchedWrite } from '../tenancy/roles';
import { TenantDb } from '../tenancy/tenant-db.service';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

@Controller('cost-centers')
@UseGuards(SessionGuard)
@ApiSession()
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
      .run(scope, (tx) => tx.costCenter.create({ data }))
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
        const { count } = await tx.costCenter.updateMany({
          where: { id },
          data: { name },
        });
        if (count === 0) return rejectUnmatchedWrite(tx, scope);
        return tx.costCenter.findUniqueOrThrow({ where: { id } });
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
        const { count } = await tx.costCenter.deleteMany({ where: { id } });
        if (count === 0) await rejectUnmatchedWrite(tx, scope);
      })
      .catch(translateDbError);
  }
}
