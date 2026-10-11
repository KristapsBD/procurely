import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text } from 'react-native';
import { fakeApi, memoryStore, TestApp } from '../test/fakes';
import { WithActiveCompany } from './with-active-company';

describe('WithActiveCompany for a person without a company', () => {
  it('explains there is no access, hides the children, and lets them sign out', async () => {
    const store = memoryStore('token-nomad');
    render(
      <TestApp api={fakeApi({ companies: async () => [] })} store={store}>
        <WithActiveCompany>
          {() => <Text>company content</Text>}
        </WithActiveCompany>
      </TestApp>,
    );

    expect(
      await screen.findByText('You do not have access to any company yet'),
    ).toBeTruthy();
    expect(screen.queryByText('company content')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(async () => expect(await store.load()).toBeNull());
  });
});
