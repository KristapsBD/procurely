import { OAuth2Client } from 'google-auth-library';

/** A Google account whose ID token passed every check. */
export interface GoogleIdentity {
  /** Google's stable subject identifier: what the person is matched on. */
  sub: string;
  email: string;
  name: string;
  /**
   * Google is authoritative for the email address (a Gmail address, or a Google Workspace
   * account), so the address really belongs to this account. Otherwise Google verified it only
   * when the account was created, and it may have changed hands since.
   */
  emailAuthoritative: boolean;
}

/** What a token must match: our client, Google's current keys and this attempt's nonce. */
export interface ExpectedIdToken {
  clientId: string;
  certs: Record<string, string>;
  nonce: string;
}

export class GoogleTokenRejected extends Error {}

/** Google signs its ID tokens with either form of the issuer. */
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];

interface IdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  hd?: string;
  nonce?: string;
}

/**
 * Verifies a Google ID token with Google's official library: the signature against Google's
 * keys, the issuer, the audience (our client id) and the expiry; then that the email is
 * verified and the nonce is the one this sign-in attempt sent.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: ExpectedIdToken,
): Promise<GoogleIdentity> {
  const payload = await checkedPayload(idToken, expected);
  if (payload.nonce !== expected.nonce) {
    throw new GoogleTokenRejected('ID token nonce does not match');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new GoogleTokenRejected('Google account email is not verified');
  }
  const email = payload.email.toLowerCase();
  return {
    sub: payload.sub,
    email,
    name: payload.name?.trim() || email.split('@')[0],
    emailAuthoritative: email.endsWith('@gmail.com') || Boolean(payload.hd),
  };
}

async function checkedPayload(
  idToken: string,
  expected: ExpectedIdToken,
): Promise<IdTokenPayload> {
  try {
    const ticket = await new OAuth2Client().verifySignedJwtWithCertsAsync(
      idToken,
      expected.certs,
      expected.clientId,
      GOOGLE_ISSUERS,
    );
    const payload = ticket.getPayload();
    if (!payload?.sub) throw new Error('ID token has no subject');
    return payload;
  } catch {
    // The library's messages can quote the token itself, so they are not passed on.
    throw new GoogleTokenRejected('ID token failed verification');
  }
}
