import { fakeApi } from '../test/fakes';
import {
  createPkcePair,
  GoogleSignInError,
  signInWithGoogle,
  type AuthBrowser,
} from './google-sign-in';

// jest-expo stubs the native digest; hash with Node instead, as the phone's native code would.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  digestStringAsync: async (_algorithm: string, data: string) =>
    jest
      .requireActual('node:crypto')
      .createHash('sha256')
      .update(data)
      .digest('base64'),
}));

const RETURN_URL = 'exp://100.64.0.1:8081/--/auth/google';
const pkce = { verifier: 'v'.repeat(64), challenge: 'c'.repeat(43) };

function browserReturning(backToApp: string | null) {
  const open = jest.fn(async () => backToApp);
  const browser: AuthBrowser = { returnUrl: () => RETURN_URL, open };
  return { browser, open };
}

describe('signInWithGoogle', () => {
  it('opens the API start URL with the return address and challenge, then redeems the code with the verifier', async () => {
    const googleSession = jest.fn(fakeApi().googleSession);
    const api = fakeApi({ googleSession });
    const { browser, open } = browserReturning(
      `${RETURN_URL}?code=hand%2Doff.x`,
    );

    const session = await signInWithGoogle(api, pkce, browser);

    expect(open).toHaveBeenCalledWith(
      api.googleStartUrl(RETURN_URL, pkce.challenge),
      RETURN_URL,
    );
    expect(googleSession).toHaveBeenCalledWith('hand-off.x', pkce.verifier);
    expect(session?.token).toBe('token-alice');
  });

  it('returns null when the person closes the browser', async () => {
    const { browser } = browserReturning(null);
    await expect(
      signInWithGoogle(fakeApi(), pkce, browser),
    ).resolves.toBeNull();
  });

  it('reports why the API refused the sign-in', async () => {
    const { browser } = browserReturning(`${RETURN_URL}?error=conflict`);
    await expect(signInWithGoogle(fakeApi(), pkce, browser)).rejects.toEqual(
      new GoogleSignInError('conflict'),
    );
  });

  it('treats a return without code or error as a failure', async () => {
    const { browser } = browserReturning(RETURN_URL);
    await expect(
      signInWithGoogle(fakeApi(), pkce, browser),
    ).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('createPkcePair', () => {
  it('makes a fresh RFC 7636 verifier and its S256 challenge', async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(a.verifier).not.toBe(b.verifier);
    const { createHash } = jest.requireActual('node:crypto');
    expect(a.challenge).toBe(
      createHash('sha256').update(a.verifier).digest('base64url'),
    );
  });
});
