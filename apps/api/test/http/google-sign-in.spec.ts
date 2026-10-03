import { createHash, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { AuthOptions, SessionResponse } from '@procurely/shared-types';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { GOOGLE_ENDPOINTS } from '../../src/auth/google-endpoints';
import { APP_CONFIG, loadConfig } from '../../src/config';
import { FakeGoogle, TEST_CLIENT_ID } from '../support/fake-google';
import { Actor, startApp } from './harness';

const RETURN_TO = 'exp://100.64.0.1:8081/--/auth/google';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function queryOf(location: string): URLSearchParams {
  return new URL(location).searchParams;
}

describe('Google sign-in', () => {
  let app: INestApplication;
  let google: FakeGoogle;
  let codes = 0;

  beforeAll(async () => {
    google = new FakeGoogle();
    const config = loadConfig({
      ...process.env,
      GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: 'test-secret',
      GOOGLE_REDIRECT_URI: 'https://dev.example.ts.net/auth/google/callback',
      GOOGLE_APP_RETURN_URLS: 'exp://100.64.0.1:8081',
    });
    app = await startApp((builder) =>
      builder
        .overrideProvider(APP_CONFIG)
        .useValue(config)
        .overrideProvider(GOOGLE_ENDPOINTS)
        .useValue(google),
    );
  });
  afterAll(() => app.close());

  const http = () => request(app.getHttpServer());

  /** Step 1: the app opens the start URL; returns the attempt carried to Google. */
  async function start(challenge: string, returnTo = RETURN_TO) {
    const res = await http()
      .get('/auth/google/start')
      .query({ return_to: returnTo, code_challenge: challenge })
      .expect(302);
    const toGoogle = queryOf(res.headers.location);
    return {
      state: toGoogle.get('state') as string,
      nonce: toGoogle.get('nonce') as string,
    };
  }

  /** Step 2: Google sends the browser back with a code for this account; returns the app URL. */
  async function callback(
    attempt: { state: string; nonce: string },
    account: Record<string, unknown>,
  ) {
    const code = `code-${++codes}`;
    google.willSignIn(code, { nonce: attempt.nonce, ...account });
    const res = await http()
      .get('/auth/google/callback')
      .query({ code, state: attempt.state })
      .expect(302);
    return res.headers.location as string;
  }

  /** The whole flow as the app runs it; returns the app URL Google's round trip ends on. */
  async function signInAs(account: Record<string, unknown>) {
    const { verifier, challenge } = pkcePair();
    const backToApp = await callback(await start(challenge), account);
    return { backToApp, verifier };
  }

  async function redeem(backToApp: string, verifier: string) {
    const res = await http()
      .post('/auth/google/session')
      .send({ code: queryOf(backToApp).get('code'), codeVerifier: verifier })
      .expect(201);
    return res.body as SessionResponse;
  }

  async function me(session: SessionResponse) {
    const res = await http()
      .get('/me')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    return res.body as { id: string; email: string; memberships: unknown[] };
  }

  it('is offered alongside the dev login', async () => {
    const res = await http().get('/auth/options').expect(200);
    expect(res.body as AuthOptions).toEqual({ devLogin: true, google: true });
  });

  it('sends the browser to Google, then back to the app with a code the app redeems for a session', async () => {
    const { backToApp, verifier } = await signInAs({
      sub: 'google-new-1',
      email: 'newcomer@gmail.com',
      name: 'New Comer',
    });
    expect(backToApp.startsWith(`${RETURN_TO}?code=`)).toBe(true);
    const session = await redeem(backToApp, verifier);
    expect(session.person).toMatchObject({
      email: 'newcomer@gmail.com',
      name: 'New Comer',
    });
    // A first-time Google user exists now, but belongs to no company yet.
    expect(await me(session)).toMatchObject({
      id: session.person.id,
      memberships: [],
    });
  });

  it('finds the same person again by the Google subject, even after the email changed', async () => {
    const first = await signInAs({
      sub: 'google-mover',
      email: 'mover@gmail.com',
    });
    const before = await redeem(first.backToApp, first.verifier);
    const again = await signInAs({
      sub: 'google-mover',
      email: 'mover.renamed@gmail.com',
    });
    const after = await redeem(again.backToApp, again.verifier);
    expect(after.person.id).toBe(before.person.id);
  });

  it('links a person an admin invited by Gmail address, who then sees that company', async () => {
    const dave = await Actor.signIn(app, PERSON.dave);
    await dave
      .inviteMember(COMPANY.main, { email: 'invitee@gmail.com', role: 'BUYER' })
      .expect(201);
    const { backToApp, verifier } = await signInAs({
      sub: 'google-invitee',
      email: 'Invitee@gmail.com',
    });
    const session = await redeem(backToApp, verifier);
    expect(await me(session)).toMatchObject({
      email: 'invitee@gmail.com',
      memberships: [{ companyId: COMPANY.main, role: 'BUYER' }],
    });
  });

  it('links an invited person through a Google Workspace account (hosted domain)', async () => {
    const dave = await Actor.signIn(app, PERSON.dave);
    await dave
      .inviteMember(COMPANY.main, {
        email: 'ws@acme.example',
        role: 'REQUESTER',
      })
      .expect(201);
    const { backToApp, verifier } = await signInAs({
      sub: 'google-workspace',
      email: 'ws@acme.example',
      hd: 'acme.example',
    });
    const session = await redeem(backToApp, verifier);
    expect((await me(session)).memberships).toHaveLength(1);
  });

  it('does not link an existing person by an address Google is not authoritative for', async () => {
    // Seeded people use @procurely.test: not Gmail, and no Workspace can host a .test domain.
    const { backToApp } = await signInAs({
      sub: 'google-alice-lookalike',
      email: 'alice@procurely.test',
    });
    expect(queryOf(backToApp).get('error')).toBe('conflict');
    expect(queryOf(backToApp).get('code')).toBeNull();
  });

  it('does not let a second Google account take over an email already linked to another', async () => {
    const owner = await signInAs({
      sub: 'google-owner',
      email: 'owned@gmail.com',
    });
    await redeem(owner.backToApp, owner.verifier);
    const { backToApp } = await signInAs({
      sub: 'google-intruder',
      email: 'owned@gmail.com',
    });
    expect(queryOf(backToApp).get('error')).toBe('conflict');
  });

  it('refuses a Google account whose email is not verified', async () => {
    const { backToApp } = await signInAs({
      sub: 'google-unverified',
      email: 'unverified@gmail.com',
      email_verified: false,
    });
    expect(queryOf(backToApp).get('error')).toBe('rejected');
  });

  it('refuses an ID token issued for another client', async () => {
    const { backToApp } = await signInAs({
      sub: 'google-other-client',
      email: 'other@gmail.com',
      aud: 'another-app.apps.googleusercontent.com',
    });
    expect(queryOf(backToApp).get('error')).toBe('rejected');
  });

  it('refuses an ID token from another sign-in attempt (nonce)', async () => {
    const { backToApp } = await signInAs({
      sub: 'google-replay',
      email: 'replay@gmail.com',
      nonce: 'another-attempt',
    });
    expect(queryOf(backToApp).get('error')).toBe('rejected');
  });

  it('tells the app when the person cancels at Google', async () => {
    const attempt = await start(pkcePair().challenge);
    const res = await http()
      .get('/auth/google/callback')
      .query({ error: 'access_denied', state: attempt.state })
      .expect(302);
    expect(res.headers.location).toBe(`${RETURN_TO}?error=cancelled`);
  });

  it('tells the app when Google does not accept the code', async () => {
    const attempt = await start(pkcePair().challenge);
    const res = await http()
      .get('/auth/google/callback')
      .query({ code: 'never-issued', state: attempt.state })
      .expect(302);
    expect(res.headers.location).toBe(`${RETURN_TO}?error=failed`);
  });

  it('refuses to send a sign-in to an app address that is not allowed', async () => {
    const { challenge } = pkcePair();
    for (const returnTo of [
      'exp://203.0.113.9:8081/--/auth/google',
      'https://evil.example/collect',
    ]) {
      await http()
        .get('/auth/google/start')
        .query({ return_to: returnTo, code_challenge: challenge })
        .expect(400);
    }
    await http()
      .get('/auth/google/start')
      .query({ return_to: RETURN_TO, code_challenge: 'too-short' })
      .expect(400);
  });

  it('refuses a callback whose state was forged or tampered with', async () => {
    const attempt = await start(pkcePair().challenge);
    const [payload, mac] = attempt.state.split('.');
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as object;
    const tampered = Buffer.from(
      JSON.stringify({ ...claims, returnTo: 'exp://203.0.113.9:8081' }),
    ).toString('base64url');
    for (const state of [`${tampered}.${mac}`, 'not-a-state', '']) {
      await http()
        .get('/auth/google/callback')
        .query({ code: 'x', state })
        .expect(400);
    }
  });

  it('redeems the code only with the verifier of the app that started the sign-in', async () => {
    const { backToApp } = await signInAs({
      sub: 'google-pkce',
      email: 'pkce@gmail.com',
    });
    const code = queryOf(backToApp).get('code');
    for (const codeVerifier of [pkcePair().verifier, undefined, 'short']) {
      await http()
        .post('/auth/google/session')
        .send({ code, codeVerifier })
        .expect(401);
    }
  });

  it('refuses a session token or a forged string as a handoff code, and a code as a session token', async () => {
    const alice = await Actor.signIn(app, PERSON.alice);
    const { verifier } = pkcePair();
    for (const code of [alice.token, 'forged.code', undefined]) {
      await http()
        .post('/auth/google/session')
        .send({ code, codeVerifier: verifier })
        .expect(401);
    }
    const { backToApp } = await signInAs({
      sub: 'google-x',
      email: 'x@gmail.com',
    });
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${queryOf(backToApp).get('code')}`)
      .expect(401);
  });

  it('expires an unredeemed handoff code after two minutes', async () => {
    const { backToApp, verifier } = await signInAs({
      sub: 'google-slow',
      email: 'slow@gmail.com',
    });
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 121 * 1000);
    try {
      await http()
        .post('/auth/google/session')
        .send({ code: queryOf(backToApp).get('code'), codeVerifier: verifier })
        .expect(401);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('Google sign-in when it is not configured', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  it('is not offered, its routes do not exist, and the dev login still works', async () => {
    const http = () => request(app.getHttpServer());
    const options = await http().get('/auth/options').expect(200);
    expect(options.body as AuthOptions).toEqual({
      devLogin: true,
      google: false,
    });
    await http()
      .get('/auth/google/start')
      .query({ return_to: RETURN_TO, code_challenge: pkcePair().challenge })
      .expect(404);
    await http().get('/auth/google/callback').query({ state: 'x' }).expect(404);
    await http().post('/auth/google/session').send({}).expect(404);
    await Actor.signIn(app, PERSON.alice);
  });
});
