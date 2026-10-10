import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { fakeApi, memoryStore, TestApp } from '../test/fakes';
import { useSession } from './session';

function SignOut() {
  const { signOut } = useSession();
  return <Text onPress={() => void signOut()}>sign out</Text>;
}

describe('signing out', () => {
  it('tells the push registrar with the session token before the session is dropped', async () => {
    const unregistered: string[] = [];
    const store = memoryStore('token-alice');
    render(
      <TestApp
        api={fakeApi()}
        store={store}
        push={{ unregister: async (t) => void unregistered.push(t) }}
      >
        <SignOut />
      </TestApp>,
    );
    const button = await screen.findByText('sign out');
    await act(async () => button.props.onPress());
    await waitFor(async () => expect(await store.load()).toBeNull());
    expect(unregistered).toEqual(['token-alice']);
  });
});
