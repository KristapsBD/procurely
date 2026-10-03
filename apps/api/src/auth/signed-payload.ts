import { createHmac, timingSafeEqual } from 'node:crypto';

/** Checks decoded claims and keeps the expected ones; null when any is missing or malformed. */
export type ClaimsParser<T> = (claims: Record<string, unknown>) => T | null;

/**
 * Expiring, HMAC-signed JSON: base64url(claims).base64url(hmac). Not encrypted, so claims are
 * readable by whoever holds the token; they just cannot be changed or forged. Each purpose signs
 * with its own key derived from the secret, so a token made for one purpose (say, the Google
 * sign-in state) never verifies as another (a session token).
 */
export class SignedPayload<T extends object> {
  private readonly key: Buffer;

  constructor(
    secret: string,
    purpose: string,
    private readonly parseClaims: ClaimsParser<T>,
  ) {
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
  verify(token: unknown): T | null {
    if (typeof token !== 'string') return null;
    const [payload, signature, ...rest] = token.split('.');
    if (!payload || !signature || rest.length > 0) return null;
    if (!this.macMatches(payload, signature)) return null;
    const claims = decode(payload);
    if (!claims || typeof claims.exp !== 'number') return null;
    if (claims.exp < Date.now() / 1000) return null;
    return this.parseClaims(claims);
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
}

/** A parser for claims that are all non-empty strings. */
export function stringClaims<K extends string>(
  ...names: K[]
): ClaimsParser<Record<K, string>> {
  return (claims) => {
    const picked: Partial<Record<K, string>> = {};
    for (const name of names) {
      const value = claims[name];
      if (typeof value !== 'string' || value === '') return null;
      picked[name] = value;
    }
    return picked as Record<K, string>;
  };
}

function decode(payload: string): Record<string, unknown> | null {
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    );
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
