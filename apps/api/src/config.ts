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
}

const DEV_SESSION_SECRET = 'dev-only-session-secret-do-not-use-in-production';

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
  };
}
