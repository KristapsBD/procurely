import { OAuth2Client } from 'google-auth-library';
import type { GoogleConfig } from '../config';

/**
 * Everything the API asks of Google itself. The real one talks to Google; the HTTP tests
 * provide a local fake (their own signing keys), so no test depends on Google.
 */
export interface GoogleEndpoints {
  /** Google's sign-in page for one attempt, returning to the configured redirect URI. */
  authorizationUrl(params: { state: string; nonce: string }): string;
  /**
   * Trades an authorization code for the ID token, server to server, authenticated with the
   * client secret.
   */
  exchangeCode(code: string): Promise<string>;
  /** Google's current public signing keys (PEM), by key id. */
  signingCerts(): Promise<Record<string, string>>;
}

export const GOOGLE_ENDPOINTS = Symbol('GOOGLE_ENDPOINTS');

export function googleEndpoints(config: GoogleConfig): GoogleEndpoints {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
  return {
    authorizationUrl: ({ state, nonce }) =>
      client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        prompt: 'select_account',
      }),
    exchangeCode: async (code) => {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Google returned no ID token');
      return tokens.id_token;
    },
    signingCerts: async () => {
      const { certs } = await client.getFederatedSignonCertsAsync();
      return certs as Record<string, string>;
    },
  };
}
