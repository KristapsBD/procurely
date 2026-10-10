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
import {
  ApproveRequisitionRequest,
  RejectRequisitionRequest,
  Requisition,
  SaveRequisitionRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import {
  parseApproveComment,
  parseRejectReason,
  parseSaveRequisition,
} from './requisition-input';
import { ApprovalNotifier } from '../notifications/approval-notifier';
import { RequisitionsService } from './requisitions.service';

@Controller('requisitions')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class RequisitionsController {
  constructor(
    private readonly db: TenantDb,
    private readonly requisitions: RequisitionsService,
    private readonly notifier: ApprovalNotifier,
  ) {}

  /**
   * Newest first: the person's own requisitions; for an approver also the submitted ones routed
   * to approvers and those they decided; for a buyer the approved ones (to order them); for an
   * admin every one of the company.
   */
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

  /**
   * Draft to submitted, refused unless it has a cost center, a justification and a line. Under
   * the company's lowest approval threshold it is approved at once, with the reason in
   * decisionNote. A company without approval rules leaves it to an admin.
   */
  @Post(':id/submit')
  @HttpCode(200)
  async submit(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Requisition> {
    const submitted = await this.db
      .run(scope, (tx) => this.requisitions.transition(tx, scope, id, 'submit'))
      .catch(translateDbError);
    if (submitted.status === 'SUBMITTED') {
      this.notifier.approvalRequested(scope, id);
    }
    return submitted;
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

  /**
   * Submitted to approved, by an approver or admin the requisition's route admits. Never by the
   * requester. The comment is optional and shown to the requester.
   */
  @Post(':id/approve')
  @HttpCode(200)
  async approve(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveRequisitionRequest,
  ): Promise<Requisition> {
    const comment = parseApproveComment(body);
    const decided = await this.db
      .run(scope, (tx) =>
        this.requisitions.decide(tx, scope, id, 'approve', comment),
      )
      .catch(translateDbError);
    this.notifier.decided(scope, id, 'APPROVED');
    return decided;
  }

  /** Submitted to rejected, by the same deciders. The reason is required and shown to the requester. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @CompanyScope() scope: CompanyRequestScope,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectRequisitionRequest,
  ): Promise<Requisition> {
    const reason = parseRejectReason(body);
    const decided = await this.db
      .run(scope, (tx) =>
        this.requisitions.decide(tx, scope, id, 'reject', reason),
      )
      .catch(translateDbError);
    this.notifier.decided(scope, id, 'REJECTED');
    return decided;
  }
}
