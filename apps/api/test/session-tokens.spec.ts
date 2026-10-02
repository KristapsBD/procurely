import { loadConfig } from '../src/config';
import { SessionTokens } from '../src/auth/session-tokens';

describe('session tokens', () => {
  const config = loadConfig({});
  const tokens = new SessionTokens(config);

  it('round-trips the person id', () => {
    expect(tokens.verify(tokens.issue('person-1'))).toBe('person-1');
  });

  it('rejects an expired token', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = tokens.issue('person-1');
    jest.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    expect(tokens.verify(token)).toBeNull();
    jest.useRealTimers();
  });

  it('rejects a token signed with another secret', () => {
    const other = new SessionTokens({ ...config, sessionSecret: 'other' });
    expect(tokens.verify(other.issue('person-1'))).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [, signature] = tokens.issue('person-1').split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'person-2', exp: 9999999999 }),
    ).toString('base64url');
    expect(tokens.verify(`${forged}.${signature}`)).toBeNull();
  });
});

describe('configuration', () => {
  it('enables dev login outside production', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).devLoginEnabled).toBe(true);
    expect(loadConfig({}).devLoginEnabled).toBe(true);
  });

  it('disables dev login in production and demands a session secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      'SESSION_SECRET',
    );
    const config = loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's' });
    expect(config.devLoginEnabled).toBe(false);
  });
});
