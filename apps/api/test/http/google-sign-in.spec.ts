import { createHash, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { AuthOptions, SessionResponse } from '@procurely/shared-types';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { GOOGLE_ENDPOINTS } from '../../src/auth/google-endpoints';
import {
  FakeGoogle,
  FakeGoogleKeys,
  TEST_CLIENT_ID,
} from '../support/fake-google';
import { Actor, startApp } from './harness';

const RETURN_TO = 'exp://100.64.0.1:8081/--/auth/google';
const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'https://dev.example.ts.net/auth/google/callback',
  GOOGLE_APP_RETURN_URLS: ' exp://100.64.0.1:8081, http://localhost:8081/app',
};

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function queryOf(location: string): URLSearchParams {
  return new URL(location).searchParams;
}

/** Runs `work` with these environment variables set, then puts the old values back. */
async function withEnv<T>(
  vars: Record<string, string>,
  work: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(vars).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, vars);
  try {
    return await work();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe('Google sign-in', () => {
  let app: INestApplication;
  let google: FakeGoogle;
  let codes = 0;

  beforeAll(async () => {
    google = new FakeGoogle();
    // The real configuration path (environment), with only Google itself faked.
    app = await withEnv(GOOGLE_ENV, () =>
      startApp((builder) =>
        builder.overrideProvider(GOOGLE_ENDPOINTS).useValue(google),
      ),
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
    opts?: Parameters<FakeGoogle['willSignIn']>[2],
  ) {
    const code = `code-${++codes}`;
    google.willSignIn(code, { nonce: attempt.nonce, ...account }, opts);
    const res = await http()
      .get('/auth/google/callback')
      .query({ code, state: attempt.state })
      .expect(302);
    return res.headers.location as string;
  }

  /** The whole flow as the app runs it; returns the app URL Google's round trip ends on. */
  async function signInAs(
    account: Record<string, unknown>,
    opts?: Parameters<FakeGoogle['willSignIn']>[2],
  ) {
    const { verifier, challenge } = pkcePair();
    const backToApp = await callback(await start(challenge), account, opts);
    return { backToApp, verifier };
  }

  async function errorFor(
    account: Record<string, unknown>,
    opts?: Parameters<FakeGoogle['willSignIn']>[2],
  ) {
    const { backToApp } = await signInAs(account, opts);
    expect(queryOf(backToApp).get('code')).toBeNull();
    return queryOf(backToApp).get('error');
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
      email: 'NewComer@gmail.com',
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

  it('names a person by their email when Google sends no name', async () => {
    const { backToApp, verifier } = await signInAs({
      sub: 'google-nameless',
      email: 'nameless@gmail.com',
    });
    expect((await redeem(backToApp, verifier)).person.name).toBe('nameless');
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

  it('refuses an account whose email Google is not authoritative for, without linking or creating anyone', async () => {
    // Seeded people use @procurely.test: not Gmail, and no Workspace can host a .test domain.
    expect(
      await errorFor({
        sub: 'google-lookalike',
        email: 'alice@procurely.test',
      }),
    ).toBe('unsupported');
    // Not even a new person: one made from this address would receive an admin's invitation
    // meant for the address's real owner.
    expect(
      await errorFor({ sub: 'google-outlook', email: 'ann@outlook.example' }),
    ).toBe('unsupported');
    const dave = await Actor.signIn(app, PERSON.dave);
    const invited = await dave
      .inviteMember(COMPANY.main, {
        email: 'ann@outlook.example',
        role: 'REQUESTER',
      })
      .expect(201);
    expect(invited.body).toMatchObject({ name: 'ann' });
  });

  it('does not let a second Google account take over an email already linked to another', async () => {
    const owner = await signInAs({
      sub: 'google-owner',
      email: 'owned@gmail.com',
    });
    await redeem(owner.backToApp, owner.verifier);
    expect(
      await errorFor({ sub: 'google-intruder', email: 'owned@gmail.com' }),
    ).toBe('conflict');
  });

  it('accepts the issuer with or without the scheme', async () => {
    const { backToApp, verifier } = await signInAs({
      sub: 'google-bare-issuer',
      email: 'bare@gmail.com',
      iss: 'accounts.google.com',
    });
    await redeem(backToApp, verifier);
  });

  it.each([
    ['an unverified email', { email_verified: false }],
    ['a token without email', { email: undefined }],
    ['a token for another client', { aud: 'other.apps.googleusercontent.com' }],
    ['another issuer', { iss: 'https://accounts.evil.test' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['a token from another attempt (nonce)', { nonce: 'another-attempt' }],
  ])('rejects %s', async (_case, claims) => {
    expect(
      await errorFor({ sub: 'google-bad', email: 'bad@gmail.com', ...claims }),
    ).toBe('rejected');
  });

  it('rejects a token signed with a key that is not Google’s, or whose key Google does not publish', async () => {
    const account = { sub: 'google-forged', email: 'forged@gmail.com' };
    const forger = new FakeGoogleKeys(google.keys.kid);
    expect(await errorFor(account, { signer: forger })).toBe('rejected');
    const unknown = new FakeGoogleKeys('unknown-key');
    expect(await errorFor(account, { signer: unknown })).toBe('rejected');
  });

  it('rejects a token whose payload was changed after signing', async () => {
    const tamper = (token: string) => {
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as object;
      const changed = Buffer.from(
        JSON.stringify({ ...claims, sub: 'google-victim' }),
      ).toString('base64url');
      return `${header}.${changed}.${signature}`;
    };
    expect(
      await errorFor(
        { sub: 'google-tamper', email: 'tamper@gmail.com' },
        { tamper },
      ),
    ).toBe('rejected');
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

  it.each([
    RETURN_TO,
    'exp://100.64.0.1:8081',
    'http://localhost:8081/app',
    'http://localhost:8081/app/auth/google',
  ])('starts a sign-in that returns to the allowed address %s', async (url) => {
    await start(pkcePair().challenge, url);
  });

  it.each([
    'exp://100.64.0.2:8081/--/auth/google', // another host
    'exp://100.64.0.1:9999/--/auth/google', // another port
    'exps://100.64.0.1:8081/--/auth/google', // another scheme
    'https://localhost:8081/app', // another scheme
    'http://localhost:8081/application', // only looks like the allowed path
    'http://localhost:8081/', // outside the allowed path
    'exp://user@100.64.0.1:8081/--/auth/google', // userinfo
    'exp://100.64.0.1:8081/--/auth/google#x', // fragment
    'https://evil.example/collect',
    'not a url',
  ])('refuses to send a sign-in back to %s', async (returnTo) => {
    await http()
      .get('/auth/google/start')
      .query({ return_to: returnTo, code_challenge: pkcePair().challenge })
      .expect(400);
  });

  it('refuses a start without a proper PKCE challenge', async () => {
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
  it('is not offered, its routes do not exist, and the dev login still works', async () => {
    // Compose passes unset variables as empty strings: the same as not configured.
    const empty = Object.fromEntries(
      Object.keys(GOOGLE_ENV).map((name) => [name, '']),
    );
    const app = await withEnv(empty, () => startApp());
    try {
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
      await http()
        .get('/auth/google/callback')
        .query({ state: 'x' })
        .expect(404);
      await http().post('/auth/google/session').send({}).expect(404);
      await Actor.signIn(app, PERSON.alice);
    } finally {
      await app.close();
    }
  });

  it('refuses to start with Google only partly configured, naming what is missing', async () => {
    await expect(
      withEnv({ ...GOOGLE_ENV, GOOGLE_CLIENT_SECRET: '' }, () => startApp()),
    ).rejects.toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
