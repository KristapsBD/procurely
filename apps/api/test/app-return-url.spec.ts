import { isAllowedReturnUrl, withParams } from '../src/auth/app-return-url';

describe('app return addresses for Google sign-in', () => {
  const allowed = ['exp://100.64.0.1:8081', 'http://localhost:8081/app'];

  it.each([
    'exp://100.64.0.1:8081/--/auth/google',
    'exp://100.64.0.1:8081',
    'http://localhost:8081/app',
    'http://localhost:8081/app/auth/google',
  ])('allows %s', (url) => {
    expect(isAllowedReturnUrl(url, allowed)).toBe(true);
  });

  it.each([
    'exp://100.64.0.2:8081/--/auth/google', // another host
    'exp://100.64.0.1:9999/--/auth/google', // another port
    'exps://100.64.0.1:8081/--/auth/google', // another scheme
    'https://localhost:8081/app', // another scheme
    'http://localhost:8081/application', // only looks like the path
    'http://localhost:8081/', // outside the path
    'exp://user@100.64.0.1:8081/--/auth/google', // userinfo
    'exp://100.64.0.1:8081/--/auth/google#x', // fragment
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAllowedReturnUrl(url, allowed)).toBe(false);
  });

  it('adds the outcome to the query of the app address', () => {
    expect(
      withParams('exp://100.64.0.1:8081/--/auth/google', { code: 'a.b' }),
    ).toBe('exp://100.64.0.1:8081/--/auth/google?code=a.b');
  });
});
