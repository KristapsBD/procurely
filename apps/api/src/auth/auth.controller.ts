import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import type { SessionResponse } from '@procurely/shared-types';
import { APP_CONFIG, type AppConfig } from '../config';
import { TenantDb } from '../tenancy/tenant-db.service';
import { isUuid } from '../tenancy/uuid';
import { SessionTokens } from './session-tokens';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: TenantDb,
    private readonly tokens: SessionTokens,
  ) {}

  /** Dev-only: sign in as any seeded person. Does not exist in production. */
  @Post('dev-login')
  async devLogin(
    @Body() body: { personId?: unknown },
  ): Promise<SessionResponse> {
    if (!this.config.devLoginEnabled) throw new NotFoundException();
    if (!isUuid(body?.personId)) {
      throw new BadRequestException('personId must be a UUID');
    }
    const personId = body.personId;
    // Under RLS a person can read only their own row, so this doubles as an existence check.
    const person = await this.db.run({ personId, companyId: null }, (tx) =>
      tx.person.findUnique({ where: { id: personId } }),
    );
    if (!person) throw new NotFoundException('Unknown person');
    return {
      token: this.tokens.issue(person.id),
      person: { id: person.id, email: person.email, name: person.name },
    };
  }
}
