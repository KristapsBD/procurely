import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { SignedPayload, stringClaims } from './signed-payload';

/**
 * Short-lived signed session token. The token only says who the person is, however they
 * signed in (Google or the dev login). Which company they act in is chosen per request and
 * verified by the database.
 */
@Injectable()
export class SessionTokens {
  private readonly signed: SignedPayload<{ sub: string }>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.signed = new SignedPayload(
      config.sessionSecret,
      'session',
      stringClaims('sub'),
    );
  }

  issue(personId: string): string {
    return this.signed.sign({ sub: personId }, this.config.sessionTtlSeconds);
  }

  /** Returns the person id, or null when the token is malformed, forged or expired. */
  verify(token: string): string | null {
    return this.signed.verify(token)?.sub ?? null;
  }
}
