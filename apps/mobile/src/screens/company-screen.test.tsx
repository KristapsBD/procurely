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
  pressToWrite,
  switchCompany,
} from '../test/fakes';
import { router } from 'expo-router';
import { ApiError } from '../api/client';
import { memoryStore } from '../test/fakes';
import { CompanyScreen } from './company-screen';

const acme = membership('company-acme', 'Acme Trading', 'ADMIN');
const nordic = membership('company-nordic', 'Nordic Supplies', 'ADMIN');
const requester = membership('company-acme', 'Acme Trading');

function costCentersByCompany(
  byCompany: Record<string, Promise<CostCenter[]>>,
) {
  return fakeApi({
    companies: async () => [acme, nordic],
    costCenters: (_token, companyId) => byCompany[companyId],
  });
}

describe('CompanyScreen company switching', () => {
  it('lists the cost centers of the selected company', async () => {
    const api = costCentersByCompany({
      [acme.companyId]: Promise.resolve([
        costCenter(acme.companyId, 'ACME-OPS'),
      ]),
      [nordic.companyId]: Promise.resolve([]),
    });
    render(
      <TestApp api={api}>
        <CompanyScreen />
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
        <CompanyScreen />
      </TestApp>,
    );
    await screen.findByText('ACME-OPS');

    switchCompany('Nordic Supplies');

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
        <CompanyScreen />
      </TestApp>,
    );
    await screen.findByRole('button', { name: 'Switch company' });
    switchCompany('Nordic Supplies');

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
        <CompanyScreen />
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
        <CompanyScreen />
      </TestApp>,
    );
    await waitFor(async () => expect(await store.load()).toBeNull());
  });
});

describe('CompanyScreen admin tools', () => {
  it.each([
    ['ADMIN', true],
    ['REQUESTER', false],
    ['APPROVER', false],
    ['BUYER', false],
  ] as const)(
    'as %s, offers members, approval rules and cost centers: %s',
    async (role, offered) => {
      render(
        <TestApp
          api={fakeApi({
            companies: async () => [membership('company-acme', 'Acme', role)],
          })}
        >
          <CompanyScreen />
        </TestApp>,
      );
      await screen.findByRole('button', { name: 'Sign out' });
      await screen.findByText(/you are/);
      for (const name of ['Members', 'Approval rules']) {
        expect(screen.queryByRole('button', { name }) !== null).toBe(offered);
      }
      expect(screen.queryByText('Cost centers') !== null).toBe(offered);
    },
  );

  it('offers no browse links to purchase orders or suppliers', async () => {
    render(
      <TestApp api={fakeApi({ companies: async () => [requester] })}>
        <CompanyScreen />
      </TestApp>,
    );
    await screen.findByText(/you are/);
    for (const name of ['Purchase orders', 'Suppliers', 'Catalog']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('CompanyScreen company chip', () => {
  it('shows the company and role, and switches through the picker', async () => {
    const api = fakeApi({
      companies: async () => [
        membership('company-acme', 'Acme Trading', 'REQUESTER'),
        membership('company-nordic', 'Nordic Supplies', 'APPROVER'),
      ],
    });
    render(
      <TestApp api={api}>
        <CompanyScreen />
      </TestApp>,
    );
    expect(await screen.findByText('· Requester')).toBeTruthy();
    switchCompany('Nordic Supplies');
    expect(await screen.findByText('· Approver')).toBeTruthy();
    expect(router.replace).toHaveBeenLastCalledWith('/inbox');
  });

  it('is a plain label with a single company', async () => {
    render(
      <TestApp api={fakeApi({ companies: async () => [requester] })}>
        <CompanyScreen />
      </TestApp>,
    );
    expect(await screen.findByText('· Requester')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Switch company' })).toBeNull();
  });
});

describe('CompanyScreen cost centers', () => {
  function renderAsAdmin() {
    const admin = membership('company-acme', 'Acme Trading', 'ADMIN');
    let rows: CostCenter[] = [costCenter(admin.companyId, 'OPS')];
    const api = fakeApi({
      companies: async () => [admin],
      costCenters: async () => rows,
      createCostCenter: jest.fn(async (_t, companyId, body) => {
        const created = { ...costCenter(companyId, body.code), ...body };
        rows = [...rows, created];
        return created;
      }),
      renameCostCenter: jest.fn(async (_t, _c, id, body) => {
        rows = rows.map((r) => (r.id === id ? { ...r, ...body } : r));
        return rows.find((r) => r.id === id)!;
      }),
      deleteCostCenter: jest.fn(async (_t, _c, id) => {
        rows = rows.filter((r) => r.id !== id);
      }),
    });
    render(
      <TestApp api={api}>
        <CompanyScreen />
      </TestApp>,
    );
    return { api, companyId: admin.companyId };
  }

  it('lets an admin add a cost center', async () => {
    const { api, companyId } = renderAsAdmin();
    fireEvent.press(
      await screen.findByRole('button', { name: 'Add cost center' }),
    );
    fireEvent.changeText(screen.getByLabelText('Cost center code'), 'HR');
    fireEvent.changeText(screen.getByLabelText('Cost center name'), 'People');
    await pressToWrite(
      screen.getByRole('button', { name: 'Save cost center' }),
    );
    expect(await screen.findByText('HR')).toBeTruthy();
    expect(api.createCostCenter).toHaveBeenCalledWith(
      'token-alice',
      companyId,
      {
        code: 'HR',
        name: 'People',
      },
    );
  });

  it('lets an admin rename a cost center', async () => {
    renderAsAdmin();
    fireEvent.press(await screen.findByRole('button', { name: 'Rename OPS' }));
    fireEvent.changeText(
      screen.getByLabelText('New name for OPS'),
      'Operations',
    );
    await pressToWrite(
      screen.getByRole('button', { name: 'Save name of OPS' }),
    );
    expect(await screen.findByText('Operations')).toBeTruthy();
  });

  it('lets an admin delete a cost center', async () => {
    const { api, companyId } = renderAsAdmin();
    await pressToWrite(
      await screen.findByRole('button', { name: 'Delete OPS' }),
    );
    await waitFor(() => expect(screen.queryByText('OPS')).toBeNull());
    expect(api.deleteCostCenter).toHaveBeenCalledWith(
      'token-alice',
      companyId,
      `${companyId}-OPS`,
    );
  });
});
