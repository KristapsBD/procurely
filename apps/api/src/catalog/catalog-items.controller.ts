import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse } from '@nestjs/swagger';
import {
  CatalogItem,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader, ApiSelectableQuery } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import {
  parseCreateCatalogItem,
  parseUpdateCatalogItem,
} from './catalog-item-input';
import { CatalogItemsService } from './catalog-items.service';

@Controller('catalog-items')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class CatalogItemsController {
  constructor(
    private readonly db: TenantDb,
    private readonly items: CatalogItemsService,
  ) {}

  /** Every item of the company with its supplier and agreed price. */
  @Get()
  @ApiSelectableQuery('items of active suppliers')
  list(
    @CompanyScope() scope: CompanyRequestScope,
    @Query('selectable') selectable?: string,
  ): Promise<CatalogItem[]> {
    return this.db.run(scope, (tx) =>
      this.items.list(tx, selectable === 'true'),
    );
  }

  @Get(':id')
  get(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogItem> {
    return this.db.run(scope, (tx) => this.items.get(tx, id));
  }

  @Post()
  create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: CreateCatalogItemRequest,
  ): Promise<CatalogItem> {
    const input = parseCreateCatalogItem(body);
    return this.db
      .run(scope, (tx) => this.items.create(tx, scope, input))
      .catch(translateDbError);
  }

  @Patch(':id')
  update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCatalogItemRequest,
  ): Promise<CatalogItem> {
    const input = parseUpdateCatalogItem(body);
    return this.db
      .run(scope, (tx) => this.items.update(tx, scope, id, input))
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
      .run(scope, (tx) => this.items.remove(tx, scope, id))
      .catch(translateDbError);
  }
}
