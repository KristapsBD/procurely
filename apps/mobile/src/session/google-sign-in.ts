import {
  GOOGLE_SIGN_IN_ERRORS,
  type GoogleSignInErrorReason,
  type SessionResponse,
} from '@procurely/shared-types';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Api } from '../api/client';

/**
 * Google sign-in as a browser flow the API drives, so it works in Expo Go (Google's native
 * sign-in library needs a development build). The app opens the API's start URL in an auth
 * browser session; the API sends it to Google, then back to this app's return address with a
 * handoff code, which the app redeems with its PKCE verifier. See docs/google-sign-in.md.
 */

/** A PKCE pair: the verifier stays in the app, the challenge goes into the start URL. */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** The browser part, separate so tests can stand in for it. */
export interface AuthBrowser {
  /** This app's address the API sends the browser back to. */
  returnUrl(): string;
  /** Opens the url; resolves with the address it came back on, or null if the person closed it. */
  open(url: string, returnUrl: string): Promise<string | null>;
}

/** Why Google sign-in did not finish (the API's `?error=`, or `failed` for anything else). */
export class GoogleSignInError extends Error {
  constructor(readonly reason: GoogleSignInErrorReason) {
    super(`Google sign-in did not finish: ${reason}`);
    this.name = 'GoogleSignInError';
  }
}

const UNRESERVED =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Made ahead of the button press: on the web target the browser blocks a popup that opens too
 * long after the tap, so nothing slow may run between the two.
 */
export async function createPkcePair(): Promise<PkcePair> {
  // 64 symbols, so byte & 63 picks each one with equal probability.
  const verifier = Array.from(
    Crypto.getRandomBytes(64),
    (byte) => UNRESERVED[byte & 63],
  ).join('');
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challenge = digest
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

export const authBrowser: AuthBrowser = {
  returnUrl: () => Linking.createURL('auth/google'),
  open: async (url, returnUrl) => {
    const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
    return result.type === 'success' ? result.url : null;
  },
};

/** Null when the person closed the browser; throws GoogleSignInError when sign-in failed. */
export async function signInWithGoogle(
  api: Api,
  pkce: PkcePair,
  browser: AuthBrowser = authBrowser,
): Promise<SessionResponse | null> {
  const returnUrl = browser.returnUrl();
  const backToApp = await browser.open(
    api.googleStartUrl(returnUrl, pkce.challenge),
    returnUrl,
  );
  if (!backToApp) return null;
  const params = queryParams(backToApp);
  if (params.code) return api.googleSession(params.code, pkce.verifier);
  const reason = GOOGLE_SIGN_IN_ERRORS.find((r) => r === params.error);
  throw new GoogleSignInError(reason ?? 'failed');
}

/** The query of a URL, decoded (React Native has no complete URL implementation). */
function queryParams(url: string): Record<string, string> {
  const query = url.split('#')[0].split('?')[1] ?? '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&').filter(Boolean)) {
    const [name, value = ''] = pair.split('=');
    params[decodeURIComponent(name)] = decodeURIComponent(
      value.replace(/\+/g, ' '),
    );
  }
  return params;
}
