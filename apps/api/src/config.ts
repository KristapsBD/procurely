export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  /** Dev-only login is available in every configuration except production. */
  devLoginEnabled: boolean;
  sessionSecret: string;
  sessionTtlSeconds: number;
}

const DEV_SESSION_SECRET = 'dev-only-session-secret-do-not-use-in-production';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === 'production';
  const sessionSecret =
    env.SESSION_SECRET ?? (production ? undefined : DEV_SESSION_SECRET);
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return {
    devLoginEnabled: !production,
    sessionSecret,
    sessionTtlSeconds: 60 * 60,
  };
}
