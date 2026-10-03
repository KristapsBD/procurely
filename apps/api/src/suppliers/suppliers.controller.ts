import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  CreateSupplierRequest,
  Supplier,
  UpdateSupplierRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader, ApiSelectableQuery } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parseCreateSupplier, parseUpdateSupplier } from './supplier-input';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class SuppliersController {
  constructor(
    private readonly db: TenantDb,
    private readonly suppliers: SuppliersService,
  ) {}

  /** Every supplier of the company, inactive ones included unless `selectable=true`. */
  @Get()
  @ApiSelectableQuery('active suppliers')
  list(
    @CompanyScope() scope: CompanyRequestScope,
    @Query('selectable') selectable?: string,
  ): Promise<Supplier[]> {
    return this.db.run(scope, (tx) =>
      this.suppliers.list(tx, selectable === 'true'),
    );
  }

  @Get(':id')
  get(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Supplier> {
    return this.db.run(scope, (tx) => this.suppliers.get(tx, id));
  }

  @Post()
  create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: CreateSupplierRequest,
  ): Promise<Supplier> {
    const input = parseCreateSupplier(body);
    return this.db
      .run(scope, (tx) => this.suppliers.create(tx, scope, input))
      .catch(translateDbError);
  }

  @Patch(':id')
  update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierRequest,
  ): Promise<Supplier> {
    const input = parseUpdateSupplier(body);
    return this.db
      .run(scope, (tx) => this.suppliers.update(tx, scope, id, input))
      .catch(translateDbError);
  }
}
