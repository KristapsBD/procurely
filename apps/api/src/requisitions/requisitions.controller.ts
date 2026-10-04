import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Requisition, SaveRequisitionRequest } from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parseSaveRequisition } from './requisition-input';
import { RequisitionsService } from './requisitions.service';

@Controller('requisitions')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class RequisitionsController {
  constructor(
    private readonly db: TenantDb,
    private readonly requisitions: RequisitionsService,
  ) {}

  /** The person's own requisitions, newest first; an admin sees every one of the company. */
  @Get()
  list(@CompanyScope() scope: CompanyRequestScope): Promise<Requisition[]> {
    return this.db.run(scope, (tx) => this.requisitions.list(tx, scope));
  }

  @Get(':id')
  get(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.db.run(scope, (tx) => this.requisitions.get(tx, scope, id));
  }

  /** Saves a new draft as the person asking. */
  @Post()
  create(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: SaveRequisitionRequest,
  ): Promise<Requisition> {
    const input = parseSaveRequisition(body);
    return this.db
      .run(scope, (tx) => this.requisitions.create(tx, scope, input))
      .catch(translateDbError);
  }

  /** Replaces a draft's cost center, justification and lines. */
  @Put(':id')
  update(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveRequisitionRequest,
  ): Promise<Requisition> {
    const input = parseSaveRequisition(body);
    return this.db
      .run(scope, (tx) => this.requisitions.update(tx, scope, id, input))
      .catch(translateDbError);
  }

  /** Draft to submitted. Refused unless it has a cost center, a justification and a line. */
  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.db
      .run(scope, (tx) => this.requisitions.transition(tx, scope, id, 'submit'))
      .catch(translateDbError);
  }

  /** Draft or submitted to cancelled. Cancelled is final. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    return this.db
      .run(scope, (tx) => this.requisitions.transition(tx, scope, id, 'cancel'))
      .catch(translateDbError);
  }
}
