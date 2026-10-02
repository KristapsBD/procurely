import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';

interface SessionClaims {
  sub: string;
  exp: number;
}

/**
 * Short-lived signed session token: base64url(claims).base64url(hmac).
 * The token only says who the person is. Which company they act in is chosen per
 * request and verified by the database, so signing in with Google later only has
 * to change how a token is obtained, not how it is used.
 */
@Injectable()
export class SessionTokens {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  issue(personId: string): string {
    const claims: SessionClaims = {
      sub: personId,
      exp: Math.floor(Date.now() / 1000) + this.config.sessionTtlSeconds,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns the person id, or null when the token is malformed, forged or expired. */
  verify(token: string): string | null {
    const [payload, signature, ...rest] = token.split('.');
    if (!payload || !signature || rest.length > 0) return null;
    if (!this.signatureMatches(payload, signature)) return null;
    const claims = this.parseClaims(payload);
    if (!claims || claims.exp < Date.now() / 1000) return null;
    return claims.sub;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(payload)
      .digest('base64url');
  }

  private signatureMatches(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private parseClaims(payload: string): SessionClaims | null {
    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as Partial<SessionClaims>;
      return typeof claims.sub === 'string' && typeof claims.exp === 'number'
        ? { sub: claims.sub, exp: claims.exp }
        : null;
    } catch {
      return null;
    }
  }
}
