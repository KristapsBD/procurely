import { loadConfig } from '../src/config';

describe('configuration', () => {
  const google = {
    GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'https://dev.example.ts.net/auth/google/callback',
    GOOGLE_APP_RETURN_URLS: 'exp://100.64.0.1:8081, http://localhost:8081',
  };

  it('starts without Google when no Google value is set (or only empty ones)', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).google).toBeNull();
    expect(
      loadConfig({
        NODE_ENV: 'test',
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: ' ',
      }).google,
    ).toBeNull();
  });

  it('reads the Google client from the environment', () => {
    expect(loadConfig({ NODE_ENV: 'test', ...google }).google).toEqual({
      clientId: 'id.apps.googleusercontent.com',
      clientSecret: 'secret',
      redirectUri: 'https://dev.example.ts.net/auth/google/callback',
      appReturnUrls: ['exp://100.64.0.1:8081', 'http://localhost:8081'],
    });
  });

  it('refuses to start with Google only partly configured', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'test', ...google, GOOGLE_CLIENT_SECRET: '' }),
    ).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
