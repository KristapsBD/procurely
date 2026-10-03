import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import type { GoogleEndpoints } from '../../src/auth/google-endpoints';

export const TEST_CLIENT_ID = 'test-client.apps.googleusercontent.com';

/** Signs ID tokens the way Google does (RS256, key id in the header), with a local key. */
export class FakeGoogleKeys {
  readonly kid: string;
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(kid = 'test-key') {
    this.kid = kid;
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  /** The public keys in the shape Google publishes them: PEM by key id. */
  get certs(): Record<string, string> {
    return {
      [this.kid]: this.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
    };
  }

  /** A valid ID token for TEST_CLIENT_ID; claims override the defaults. */
  idToken(claims: Record<string, unknown>): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', kid: this.kid, typ: 'JWT' };
    const payload = {
      iss: 'https://accounts.google.com',
      aud: TEST_CLIENT_ID,
      iat: now,
      exp: now + 3600,
      email_verified: true,
      ...claims,
    };
    const encode = (part: object) =>
      Buffer.from(JSON.stringify(part)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(this.privateKey)
      .toString('base64url');
    return `${signingInput}.${signature}`;
  }
}

/**
 * Stands in for Google in the HTTP tests. A test registers which account an authorization code
 * belongs to; exchanging it returns an ID token signed with the local keys. Nothing goes out.
 */
export class FakeGoogle implements GoogleEndpoints {
  readonly keys = new FakeGoogleKeys();
  private readonly tokens = new Map<string, () => string>();

  authorizationUrl(params: { state: string; nonce: string }): string {
    const url = new URL('https://accounts.google.test/o/oauth2/v2/auth');
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    return url.href;
  }

  /**
   * The next exchange of `code` returns an ID token with these claims, signed with Google's
   * (fake) key, or with `signer` to stand in for a forger. `tamper` edits the finished token.
   */
  willSignIn(
    code: string,
    claims: Record<string, unknown>,
    opts: { signer?: FakeGoogleKeys; tamper?: (token: string) => string } = {},
  ): void {
    const token = () => (opts.signer ?? this.keys).idToken(claims);
    this.tokens.set(code, () => (opts.tamper ?? ((t) => t))(token()));
  }

  async exchangeCode(code: string): Promise<string> {
    const token = this.tokens.get(code);
    if (!token) throw new Error('invalid_grant');
    this.tokens.delete(code);
    return token();
  }

  async signingCerts(): Promise<Record<string, string>> {
    return this.keys.certs;
  }
}
