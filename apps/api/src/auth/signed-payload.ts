import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Expiring, HMAC-signed JSON: base64url(claims).base64url(hmac). Not encrypted, so claims are
 * readable by whoever holds the token; they just cannot be changed or forged. Each purpose signs
 * with its own key derived from the secret, so a token made for one purpose (say, the Google
 * sign-in state) never verifies as another (a session token).
 */
export class SignedPayload<T extends object> {
  private readonly key: Buffer;

  constructor(secret: string, purpose: string) {
    this.key = createHmac('sha256', secret).update(purpose).digest();
  }

  sign(claims: T, ttlSeconds: number): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = Buffer.from(JSON.stringify({ ...claims, exp })).toString(
      'base64url',
    );
    return `${payload}.${this.mac(payload)}`;
  }

  /** The claims, or null when the token is malformed, forged or expired. */
  verify(token: string): (Partial<T> & { exp: number }) | null {
    const [payload, signature, ...rest] = token.split('.');
    if (!payload || !signature || rest.length > 0) return null;
    if (!this.macMatches(payload, signature)) return null;
    const claims = this.parse(payload);
    if (!claims || claims.exp < Date.now() / 1000) return null;
    return claims;
  }

  private mac(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }

  private macMatches(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.mac(payload));
    const actual = Buffer.from(signature);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private parse(payload: string): (Partial<T> & { exp: number }) | null {
    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as (Partial<T> & { exp?: unknown }) | null;
      return claims && typeof claims.exp === 'number'
        ? (claims as Partial<T> & { exp: number })
        : null;
    } catch {
      return null;
    }
  }
}
