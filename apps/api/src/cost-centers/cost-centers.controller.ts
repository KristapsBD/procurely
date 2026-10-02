import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CostCenter,
  CreateCostCenterRequest,
  UpdateCostCenterRequest,
} from '@procurely/shared-types';
import { SessionGuard } from '../auth/session.guard';
import { CompanyScope, type RequestScope } from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';

type CompanyRequestScope = RequestScope & { companyId: string };

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

/** Turns database errors into HTTP errors. RLS rejections surface as Postgres 42501. */
function translateDbError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      throw new ConflictException('Code already used');
    if (error.code === 'P2025') throw new NotFoundException();
  }
  if (String(error).includes('row-level security')) {
    throw new ForbiddenException('Not allowed in this company');
  }
  throw error;
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
