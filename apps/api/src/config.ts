export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  /** Dev-only login: only when NODE_ENV is explicitly development or test (fails closed). */
  devLoginEnabled: boolean;
  /**
   * Any origin may call the API from a browser: the Expo web target runs on another port. Dev
   * only, same fail-closed rule as the dev login; a deployed web client gets an origin
   * allowlist when there is one.
   */
  corsAnyOrigin: boolean;
  sessionSecret: string;
  sessionTtlSeconds: number;
  /** Google sign-in; null when it is not configured (the API still starts, without it). */
  google: GoogleConfig | null;
}

/** A Google OAuth client of type "Web application" (see docs/google-sign-in.md). */
export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** This API's callback, exactly as registered with Google: https, or http://localhost. */
  redirectUri: string;
  /**
   * Where the API may send the browser back to the app after Google: each entry is a URL
   * prefix such as exp://100.64.0.1:8081 (Expo Go) or http://localhost:8081 (web target).
   * Anything else is refused, so a crafted sign-in link cannot hand a session to someone else.
   */
  appReturnUrls: string[];
}

const DEV_SESSION_SECRET = 'dev-only-session-secret-do-not-use-in-production';

const GOOGLE_REQUIRED = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_APP_RETURN_URLS',
] as const;

function loadGoogleConfig(env: NodeJS.ProcessEnv): GoogleConfig | null {
  // Unset and empty are the same (compose passes empty strings for unset variables).
  const [clientId, clientSecret, redirectUri, appReturnUrls] =
    GOOGLE_REQUIRED.map((name) => env[name]?.trim() ?? '');
  const missing = GOOGLE_REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length === GOOGLE_REQUIRED.length) return null;
  if (missing.length > 0) {
    throw new Error(
      `Google sign-in is partly configured; also set ${missing.join(', ')}`,
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: new URL(redirectUri).href,
    appReturnUrls: appReturnUrls
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const devMode = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
  const sessionSecret =
    env.SESSION_SECRET ?? (devMode ? DEV_SESSION_SECRET : undefined);
  if (!sessionSecret) {
    throw new Error(
      'SESSION_SECRET must be set unless NODE_ENV is development or test',
    );
  }
  return {
    devLoginEnabled: devMode,
    corsAnyOrigin: devMode,
    sessionSecret,
    sessionTtlSeconds: 60 * 60,
    google: loadGoogleConfig(env),
  };
}
