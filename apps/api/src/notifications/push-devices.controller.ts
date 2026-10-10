import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse } from '@nestjs/swagger';
import {
  PushOutboxEntry,
  RegisterPushDeviceRequest,
} from '../contract/api.dto';
import { ApiCompanyHeader } from '../contract/decorators';
import { SessionGuard } from '../auth/session.guard';
import { APP_CONFIG, type AppConfig } from '../config';
import { translateDbError } from '../tenancy/db-errors';
import {
  CompanyScope,
  type CompanyRequestScope,
} from '../tenancy/request-scope';
import { TenantDb } from '../tenancy/tenant-db.service';
import { parsePushToken } from './push-token';
import { PushOutbox } from './push-outbox';

/**
 * The phones a person receives notifications on, one company each: the company they act in when
 * the app registers. Registering again, from another company or by another person, moves the
 * device. Switching company in the app re-registers, so a phone only ever hears about the
 * company its person is acting in.
 */
@Controller('push-devices')
@UseGuards(SessionGuard)
@ApiBearerAuth()
@ApiCompanyHeader()
export class PushDevicesController {
  constructor(
    private readonly db: TenantDb,
    private readonly outbox: PushOutbox,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @HttpCode(204)
  @ApiNoContentResponse()
  async register(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: RegisterPushDeviceRequest,
  ): Promise<void> {
    const token = parsePushToken(body);
    await this.db
      .run(scope, (tx) => tx.$executeRaw`SELECT register_push_device(${token})`)
      .catch(translateDbError);
  }

  /** Stops notifications to this phone for the person. Unknown tokens are ignored. */
  @Delete()
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CompanyScope() scope: CompanyRequestScope,
    @Body() body: RegisterPushDeviceRequest,
  ): Promise<void> {
    const token = parsePushToken(body);
    await this.db.run(scope, (tx) =>
      tx.pushDevice.deleteMany({ where: { token } }),
    );
  }

  /**
   * Development only (404 elsewhere): the notifications the API produced for the person's own
   * registered devices in this company, newest first. Lets delivery be checked without a phone.
   */
  @Get('outbox')
  async outboxFor(
    @CompanyScope() scope: CompanyRequestScope,
  ): Promise<PushOutboxEntry[]> {
    if (!this.config.devLoginEnabled) throw new NotFoundException();
    const devices = await this.db.run(scope, (tx) =>
      tx.pushDevice.findMany({ select: { token: true } }),
    );
    return this.outbox
      .addressedTo(devices.map((d) => d.token))
      .map(({ id, sentAt, message }) => ({
        id,
        sentAt: sentAt.toISOString(),
        title: message.title,
        body: message.body,
        kind: message.data.kind,
        requisitionId: message.data.requisitionId,
        companyId: message.data.companyId,
      }));
  }
}
