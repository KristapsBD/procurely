import type { CostCenter } from '@procurely/shared-types';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {
  TestApp,
  costCenter,
  deferred,
  fakeApi,
  membership,
} from '../test/fakes';
import { ApiError } from '../api/client';
import { memoryStore } from '../test/fakes';
import { HomeScreen } from './home-screen';

const acme = membership('company-acme', 'Acme Trading');
const nordic = membership('company-nordic', 'Nordic Supplies');

function costCentersByCompany(
  byCompany: Record<string, Promise<CostCenter[]>>,
) {
  return fakeApi({
    companies: async () => [acme, nordic],
    costCenters: (_token, companyId) => byCompany[companyId],
  });
}

describe('HomeScreen company switching', () => {
  it('lists the cost centers of the selected company', async () => {
    const api = costCentersByCompany({
      [acme.companyId]: Promise.resolve([
        costCenter(acme.companyId, 'ACME-OPS'),
      ]),
      [nordic.companyId]: Promise.resolve([]),
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
      </TestApp>,
    );
    expect(await screen.findByText('ACME-OPS')).toBeTruthy();
  });

  it('never shows the previous company’s cost centers after a switch, even while loading', async () => {
    const nordicData = deferred<CostCenter[]>();
    const api = costCentersByCompany({
      [acme.companyId]: Promise.resolve([
        costCenter(acme.companyId, 'ACME-OPS'),
      ]),
      [nordic.companyId]: nordicData.promise,
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
      </TestApp>,
    );
    await screen.findByText('ACME-OPS');

    fireEvent.press(screen.getByRole('button', { name: 'Nordic Supplies' }));

    // The very first render after the switch: nothing of Acme, a loading state instead.
    expect(screen.queryByText('ACME-OPS')).toBeNull();
    expect(screen.getByLabelText('Loading cost centers')).toBeTruthy();

    await act(async () =>
      nordicData.resolve([costCenter(nordic.companyId, 'NORD-HQ')]),
    );
    expect(await screen.findByText('NORD-HQ')).toBeTruthy();
    expect(screen.queryByText('ACME-OPS')).toBeNull();
  });

  it('ignores a slow response for a company that is no longer selected', async () => {
    const acmeData = deferred<CostCenter[]>();
    const nordicData = deferred<CostCenter[]>();
    const api = costCentersByCompany({
      [acme.companyId]: acmeData.promise,
      [nordic.companyId]: nordicData.promise,
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
      </TestApp>,
    );
    fireEvent.press(
      await screen.findByRole('button', { name: 'Nordic Supplies' }),
    );

    await act(async () =>
      acmeData.resolve([costCenter(acme.companyId, 'ACME-OPS')]),
    );
    expect(screen.queryByText('ACME-OPS')).toBeNull();

    await act(async () =>
      nordicData.resolve([costCenter(nordic.companyId, 'NORD-HQ')]),
    );
    expect(await screen.findByText('NORD-HQ')).toBeTruthy();
    expect(screen.queryByText('ACME-OPS')).toBeNull();
  });

  it('shows a clear empty state for a person without any company', async () => {
    render(
      <TestApp api={fakeApi({ companies: async () => [] })}>
        <HomeScreen />
      </TestApp>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/do not have access to any company/),
      ).toBeTruthy(),
    );
  });

  it('signs out when the API rejects the token on a company call', async () => {
    const store = memoryStore('token-alice');
    const api = fakeApi({
      companies: async () => [acme],
      costCenters: async () => {
        throw new ApiError(401, 'expired');
      },
    });
    render(
      <TestApp api={api} store={store}>
        <HomeScreen />
      </TestApp>,
    );
    await waitFor(async () => expect(await store.load()).toBeNull());
  });
});
