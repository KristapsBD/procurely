import { QueryClient } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Api } from '../api/client';
import { AppProviders } from '../app-providers';
import { useSession } from '../session/session';
import { fakeApi, memoryStore } from '../test/fakes';
import { LoginScreen } from './login-screen';

const RETURN_URL = 'exp://100.64.0.1:8081/--/auth/google';

jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: () => 'exp://100.64.0.1:8081/--/auth/google',
}));
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  digestStringAsync: async () => 'Y2hhbGxlbmdl+/==',
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel' },
}));
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);

function SignedInAs() {
  const { state } = useSession();
  return state.status === 'signedIn' ? (
    <Text>{`signed in as ${state.person.name}`}</Text>
  ) : null;
}

function renderLogin(api: Api) {
  const store = memoryStore();
  render(
    <AppProviders
      api={api}
      store={store}
      queryClient={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: Infinity } },
        })
      }
    >
      <LoginScreen />
      <SignedInAs />
    </AppProviders>,
  );
  return store;
}

const withGoogle = (overrides: Partial<Api> = {}) =>
  fakeApi({
    authOptions: async () => ({ devLogin: true, google: true }),
    ...overrides,
  });

describe('LoginScreen', () => {
  beforeEach(() => openAuthSession.mockReset());

  it('says so when the API has no Google sign-in, and still offers the dev login', async () => {
    renderLogin(fakeApi());
    expect(
      await screen.findByText(/Google sign-in is not configured/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Sign in as Alice' }),
    ).toBeTruthy();
  });

  it('signs in with Google through the browser and keeps the session', async () => {
    const googleSession = jest.fn(fakeApi().googleSession);
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `${RETURN_URL}?code=handoff`,
    });
    const store = renderLogin(withGoogle({ googleSession }));

    const button = await screen.findByRole('button', {
      name: 'Sign in with Google',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.press(button);

    expect(await screen.findByText('signed in as Alice')).toBeTruthy();
    expect(await store.load()).toBe('token-alice');
    const [startUrl, returnUrl] = openAuthSession.mock.calls[0];
    expect(returnUrl).toBe(RETURN_URL);
    expect(startUrl).toContain('code_challenge=Y2hhbGxlbmdl-_');
    expect(googleSession).toHaveBeenCalledWith(
      'handoff',
      expect.stringMatching(/^[A-Za-z0-9_-]{64}$/),
    );
  });

  it('explains a refused Google account and lets the person try again', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `${RETURN_URL}?error=conflict`,
    });
    renderLogin(withGoogle());

    const button = await screen.findByRole('button', {
      name: 'Sign in with Google',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.press(button);

    expect(
      await screen.findByText(/already belongs to another account/),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in with Google' }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText(/signed in as/)).toBeNull();
  });

  it('stays on the login screen without an error when the person closes the browser', async () => {
    openAuthSession.mockResolvedValue({
      type: WebBrowser.WebBrowserResultType.CANCEL,
    });
    renderLogin(withGoogle());
    const button = await screen.findByRole('button', {
      name: 'Sign in with Google',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.press(button);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sign in with Google' }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/signed in as/)).toBeNull();
  });
});
