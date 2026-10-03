import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import {
  AuthOptions,
  DevLoginRequest,
  SessionResponse,
} from '../contract/api.dto';
import { APP_CONFIG, type AppConfig } from '../config';
import { isUuid } from '../tenancy/uuid';
import { Sessions } from './sessions';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: Sessions,
  ) {}

  /** Which ways of signing in this API offers, so the app shows only those. */
  @Get('options')
  options(): AuthOptions {
    return {
      devLogin: this.config.devLoginEnabled,
      google: this.config.google !== null,
    };
  }

  /** Dev-only: sign in as any seeded person. Does not exist in production. */
  @Post('dev-login')
  async devLogin(@Body() body: DevLoginRequest): Promise<SessionResponse> {
    if (!this.config.devLoginEnabled) throw new NotFoundException();
    if (!isUuid(body?.personId)) {
      throw new BadRequestException('personId must be a UUID');
    }
    const session = await this.sessions.start(body.personId);
    if (!session) throw new NotFoundException('Unknown person');
    return session;
  }
}
