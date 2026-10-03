import type { Supplier } from '@procurely/shared-types';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ApiError } from '../api/client';
import {
  TestApp,
  fakeApi,
  membership,
  pressToWrite,
  supplier,
} from '../test/fakes';
import { SuppliersScreen } from './suppliers-screen';

const ACME = 'company-acme';
const office = supplier(ACME, 'Office Depot');
const oldMill = supplier(ACME, 'Old Paper Mill', false);

function renderAs(role: 'REQUESTER' | 'BUYER', overrides = {}) {
  let rows: Supplier[] = [office, oldMill];
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    suppliers: jest.fn(async () => rows),
    createSupplier: jest.fn(async (_t, companyId, body) => {
      const created = supplier(companyId, body.name);
      rows = [...rows, created];
      return created;
    }),
    updateSupplier: jest.fn(async (_t, _c, id, body) => {
      rows = rows.map((s) => (s.id === id ? { ...s, ...body } : s));
      return rows.find((s) => s.id === id)!;
    }),
    ...overrides,
  });
  render(
    <TestApp api={api}>
      <SuppliersScreen />
    </TestApp>,
  );
  return api;
}

describe('SuppliersScreen', () => {
  it('shows a requester every supplier with its status, and no way to change them', async () => {
    renderAs('REQUESTER');
    expect(await screen.findByText('Office Depot')).toBeTruthy();
    expect(screen.getByText('Old Paper Mill')).toBeTruthy();
    expect(screen.getByText(/Inactive: cannot be chosen/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add supplier' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Deactivate Office Depot' }),
    ).toBeNull();
  });

  it('lets a buyer add a supplier in the company they act in', async () => {
    const api = renderAs('BUYER');
    fireEvent.press(
      await screen.findByRole('button', { name: 'Add supplier' }),
    );
    fireEvent.changeText(
      screen.getByLabelText('New supplier name'),
      ' Paper Partners ',
    );
    await pressToWrite(screen.getByRole('button', { name: 'Save supplier' }));

    expect(await screen.findByText('Paper Partners')).toBeTruthy();
    expect(api.createSupplier).toHaveBeenCalledWith('token-alice', ACME, {
      name: 'Paper Partners',
    });
  });

  it('lets a buyer deactivate and reactivate a supplier', async () => {
    const api = renderAs('BUYER');
    await pressToWrite(
      await screen.findByRole('button', { name: 'Deactivate Office Depot' }),
    );
    await pressToWrite(
      await screen.findByRole('button', { name: 'Reactivate Office Depot' }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Deactivate Office Depot' }),
      ).toBeTruthy(),
    );
    expect(api.updateSupplier).toHaveBeenNthCalledWith(
      1,
      'token-alice',
      ACME,
      office.id,
      { active: false },
    );
    expect(api.updateSupplier).toHaveBeenNthCalledWith(
      2,
      'token-alice',
      ACME,
      office.id,
      { active: true },
    );
  });

  it('lets a buyer rename a supplier, and shows why a save was refused', async () => {
    renderAs('BUYER', {
      updateSupplier: async () => {
        throw new ApiError(409, 'Already exists');
      },
    });
    fireEvent.press(
      await screen.findByRole('button', { name: 'Rename Office Depot' }),
    );
    fireEvent.changeText(
      screen.getByLabelText('New name for Office Depot'),
      'Old Paper Mill',
    );
    await pressToWrite(screen.getByRole('button', { name: 'Save supplier' }));
    expect(await screen.findByText('Already exists')).toBeTruthy();
  });
});
