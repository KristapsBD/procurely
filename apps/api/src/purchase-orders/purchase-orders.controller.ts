import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreatePurchaseOrderRequest, PurchaseOrder } from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parseCreatePurchaseOrder } from './purchase-order-input';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class PurchaseOrdersController {
  constructor(
    private readonly db: TenantDb,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  /**
   * Newest first. Buyers and admins get every order of the company; a requester the orders of
   * their own requisitions; an approver those of the requisitions they decided.
   */
  @Get()
  list(@CompanyScope() scope: CompanyRequestScope): Promise<PurchaseOrder[]> {
    return this.db.run(scope, (tx) => this.purchaseOrders.list(tx));
  }

  @Get(':id')
  get(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrder> {
    return this.db.run(scope, (tx) => this.purchaseOrders.get(tx, id));
  }

  /**
   * Buyers and admins only. Refused unless the requisition is approved and has no order yet,
   * the supplier is active, and every item belongs to that supplier. A requisition converts
   * once; a second attempt is a 409.
   */
  @Post()
  create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrder> {
    const input = parseCreatePurchaseOrder(body);
    return this.db
      .run(scope, (tx) => this.purchaseOrders.create(tx, scope, input))
      .catch(translateDbError);
  }
}
