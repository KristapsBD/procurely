import { verifyGoogleIdToken } from '../src/auth/google-id-token';
import { FakeGoogleKeys, TEST_CLIENT_ID } from './support/fake-google';

describe('Google ID token verification', () => {
  const keys = new FakeGoogleKeys();
  const nonce = 'nonce-1';
  const expected = { clientId: TEST_CLIENT_ID, nonce, certs: keys.certs };
  const account = { sub: '1001', email: 'Ann@Gmail.com', name: 'Ann', nonce };

  it('accepts a token signed by Google for our client and returns the identity', async () => {
    await expect(
      verifyGoogleIdToken(keys.idToken(account), expected),
    ).resolves.toEqual({
      sub: '1001',
      email: 'ann@gmail.com',
      name: 'Ann',
      mayLinkByEmail: true,
    });
  });

  it('accepts the issuer without the scheme too', async () => {
    const token = keys.idToken({ ...account, iss: 'accounts.google.com' });
    await expect(verifyGoogleIdToken(token, expected)).resolves.toMatchObject({
      sub: '1001',
    });
  });

  it.each([
    [
      'another client (audience)',
      { aud: 'someone-else.apps.googleusercontent.com' },
    ],
    ['another issuer', { iss: 'https://accounts.evil.test' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['an unverified email', { email_verified: false }],
    ['a token without email', { email: undefined }],
    ['another sign-in attempt (nonce)', { nonce: 'nonce-2' }],
    ['a token without nonce', { nonce: undefined }],
  ])('rejects %s', async (_case, claims) => {
    const token = keys.idToken({ ...account, ...claims });
    await expect(verifyGoogleIdToken(token, expected)).rejects.toThrow();
  });

  it('rejects a token signed with a key that is not Google’s', async () => {
    const forger = new FakeGoogleKeys(keys.kid);
    await expect(
      verifyGoogleIdToken(forger.idToken(account), expected),
    ).rejects.toThrow();
  });

  it('rejects a token whose key id Google does not publish', async () => {
    const unknown = new FakeGoogleKeys('unknown-key');
    await expect(
      verifyGoogleIdToken(unknown.idToken(account), expected),
    ).rejects.toThrow();
  });

  it('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = keys.idToken(account).split('.');
    const payload = Buffer.from(
      JSON.stringify({ ...account, sub: '9999', aud: TEST_CLIENT_ID }),
    ).toString('base64url');
    await expect(
      verifyGoogleIdToken(`${header}.${payload}.${signature}`, expected),
    ).rejects.toThrow();
  });

  it('lets the email link an invited person only where Google is authoritative', async () => {
    const identity = (claims: object) =>
      verifyGoogleIdToken(keys.idToken({ ...account, ...claims }), expected);
    await expect(identity({ email: 'ann@gmail.com' })).resolves.toMatchObject({
      mayLinkByEmail: true,
    });
    await expect(
      identity({ email: 'ann@acme.example', hd: 'acme.example' }),
    ).resolves.toMatchObject({ mayLinkByEmail: true });
    await expect(
      identity({ email: 'ann@outlook.example' }),
    ).resolves.toMatchObject({ mayLinkByEmail: false });
  });

  it('falls back to the email name when Google sends no name', async () => {
    const token = keys.idToken({ ...account, name: undefined });
    await expect(verifyGoogleIdToken(token, expected)).resolves.toMatchObject({
      name: 'ann',
    });
  });
});
