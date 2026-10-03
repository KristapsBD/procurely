import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { SessionResponse } from '../contract/api.dto';
import { APP_CONFIG, type AppConfig, type GoogleConfig } from '../config';
import { TenantDb } from '../tenancy/tenant-db.service';
import { isAllowedReturnUrl, withParams } from './app-return-url';
import { GOOGLE_ENDPOINTS, type GoogleEndpoints } from './google-endpoints';
import {
  GoogleTokenRejected,
  verifyGoogleIdToken,
  type GoogleIdentity,
} from './google-id-token';
import { Sessions } from './sessions';
import { SignedPayload } from './signed-payload';

/** One sign-in attempt, carried through Google in the OAuth `state` parameter. */
interface AttemptClaims {
  returnTo: string;
  challenge: string;
  nonce: string;
}

/** What the app redeems for a session: who signed in, for the attempt with this challenge. */
interface HandoffClaims {
  personId: string;
  challenge: string;
}

/** Why a sign-in did not finish, as the app receives it (`?error=`). */
export type GoogleSignInError =
  'cancelled' | 'rejected' | 'conflict' | 'failed';

/** An S256 PKCE challenge: base64url of a SHA-256 digest, no padding. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** A PKCE code verifier (RFC 7636). */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const ATTEMPT_TTL_SECONDS = 10 * 60;
const HANDOFF_TTL_SECONDS = 2 * 60;

/**
 * Google sign-in for the app, as a browser flow the API drives (it works in Expo Go, which
 * cannot run Google's native sign-in library; see docs/google-sign-in.md):
 *
 *   1. start: the app opens the API in a browser with its return address and a PKCE challenge;
 *      the API sends the browser on to Google.
 *   2. callback: Google sends the browser back to the API (the https redirect URI registered
 *      with Google). The API trades the code for the ID token, verifies it, finds or creates
 *      the person and sends the browser back to the app with a short-lived handoff code.
 *   3. session: the app redeems the handoff code with its PKCE verifier for a session token.
 *
 * No server-side state: the attempt and the handoff code are signed with the session secret.
 * The verifier never leaves the app, so a code read from a URL is useless to anyone else.
 */
@Injectable()
export class GoogleSignIn {
  private readonly logger = new Logger(GoogleSignIn.name);
  private readonly attempts: SignedPayload<AttemptClaims>;
  private readonly handoffs: SignedPayload<HandoffClaims>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(GOOGLE_ENDPOINTS) private readonly google: GoogleEndpoints | null,
    private readonly db: TenantDb,
    private readonly sessions: Sessions,
  ) {
    this.attempts = new SignedPayload(config.sessionSecret, 'google-attempt');
    this.handoffs = new SignedPayload(config.sessionSecret, 'google-handoff');
  }

  /** Step 1: Google's sign-in page for a new attempt. */
  start(returnTo: unknown, challenge: unknown): string {
    const { config, google } = this.configured();
    if (!this.isAllowedReturn(returnTo, config)) {
      throw new BadRequestException('return_to is not an allowed app address');
    }
    if (typeof challenge !== 'string' || !CHALLENGE.test(challenge)) {
      throw new BadRequestException('code_challenge must be an S256 challenge');
    }
    const nonce = randomBytes(16).toString('base64url');
    const state = this.attempts.sign(
      { returnTo, challenge, nonce },
      ATTEMPT_TTL_SECONDS,
    );
    return google.authorizationUrl({ state, nonce });
  }

  /** Step 2: where to send the browser after Google: back to the app, with a code or an error. */
  async callback(query: { code?: unknown; state?: unknown }): Promise<string> {
    const { config } = this.configured();
    const attempt =
      typeof query.state === 'string'
        ? this.attempts.verify(query.state)
        : null;
    if (
      !attempt?.challenge ||
      !attempt.nonce ||
      !this.isAllowedReturn(attempt.returnTo, config)
    ) {
      throw new BadRequestException(
        'This sign-in link is invalid or expired. Start again from the app.',
      );
    }
    const outcome = await this.finish(query.code, attempt).catch(
      (error: unknown) => ({ error: this.failure(error) }),
    );
    return withParams(attempt.returnTo, outcome);
  }

  /** Step 3: the app redeems the handoff code with the verifier only it holds. */
  async session(code: unknown, verifier: unknown): Promise<SessionResponse> {
    this.configured();
    const handoff =
      typeof code === 'string' ? this.handoffs.verify(code) : null;
    if (
      !handoff?.personId ||
      !handoff.challenge ||
      !matchesChallenge(verifier, handoff.challenge)
    ) {
      throw new UnauthorizedException('Sign-in code is invalid or expired');
    }
    const session = await this.sessions.start(handoff.personId);
    if (!session) throw new UnauthorizedException();
    return session;
  }

  private async finish(
    code: unknown,
    attempt: Partial<AttemptClaims>,
  ): Promise<{ code: string } | { error: GoogleSignInError }> {
    // No code: the person cancelled or Google refused (`?error=access_denied` and the like).
    if (typeof code !== 'string' || code === '') return { error: 'cancelled' };
    const { config, google } = this.configured();
    const idToken = await google.exchangeCode(code);
    const identity = await verifyGoogleIdToken(idToken, {
      clientId: config.clientId,
      nonce: attempt.nonce as string,
      certs: await google.signingCerts(),
    });
    const personId = await this.findOrCreatePerson(identity);
    if (!personId) return { error: 'conflict' };
    return {
      code: this.handoffs.sign(
        { personId, challenge: attempt.challenge as string },
        HANDOFF_TTL_SECONDS,
      ),
    };
  }

  private async findOrCreatePerson(
    identity: GoogleIdentity,
  ): Promise<string | null> {
    const [row] = await this.db.runWithoutIdentity(
      (tx) => tx.$queryRaw<{ id: string | null }[]>`
        SELECT google_sign_in(${identity.sub}, ${identity.email}, ${identity.name},
                              ${identity.mayLinkByEmail}) AS id`,
    );
    return row?.id ?? null;
  }

  private failure(error: unknown): GoogleSignInError {
    // The rejection message can quote the token itself, so it is not logged.
    if (error instanceof GoogleTokenRejected) {
      this.logger.warn('Google ID token rejected');
      return 'rejected';
    }
    this.logger.error(
      `Google sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 'failed';
  }

  private isAllowedReturn(
    returnTo: unknown,
    config: GoogleConfig,
  ): returnTo is string {
    return (
      typeof returnTo === 'string' &&
      isAllowedReturnUrl(returnTo, config.appReturnUrls)
    );
  }

  /** Google sign-in routes do not exist when Google is not configured. */
  private configured(): { config: GoogleConfig; google: GoogleEndpoints } {
    if (!this.config.google || !this.google) throw new NotFoundException();
    return { config: this.config.google, google: this.google };
  }
}

function matchesChallenge(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !VERIFIER.test(verifier)) return false;
  return (
    createHash('sha256').update(verifier).digest('base64url') === challenge
  );
}
