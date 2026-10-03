import type { CatalogItem } from '@procurely/shared-types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  TestApp,
  catalogItem,
  fakeApi,
  membership,
  supplier,
  pressToWrite,
} from '../test/fakes';
import { CatalogScreen } from './catalog-screen';

const ACME = 'company-acme';
const office = supplier(ACME, 'Office Depot');
const tech = supplier(ACME, 'TechWorld');
const oldMill = supplier(ACME, 'Old Paper Mill', false);
const paper = catalogItem(office, 'A4 copy paper', 2499);
const recycled = catalogItem(oldMill, 'Recycled paper', 1999);

function renderAs(role: 'REQUESTER' | 'BUYER') {
  let rows: CatalogItem[] = [paper, recycled];
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    catalogItems: async () => rows,
    // The API leaves inactive suppliers out of the selectable list.
    suppliers: jest.fn(async (_t, _c, opts) =>
      opts?.selectable ? [office, tech] : [office, tech, oldMill],
    ),
    createCatalogItem: jest.fn(async (_t, _c, body) => {
      const s = [office, tech].find((x) => x.id === body.supplierId)!;
      const created = catalogItem(s, body.name, body.unitPriceMinor);
      rows = [...rows, created];
      return created;
    }),
    updateCatalogItem: jest.fn(async (_t, _c, id, body) => {
      rows = rows.map((i) => (i.id === id ? { ...i, ...body } : i));
      return rows.find((i) => i.id === id)!;
    }),
  });
  render(
    <TestApp api={api}>
      <CatalogScreen />
    </TestApp>,
  );
  return api;
}

describe('CatalogScreen', () => {
  it('shows a requester items with supplier and agreed price, read only', async () => {
    renderAs('REQUESTER');
    expect(await screen.findByText('A4 copy paper')).toBeTruthy();
    expect(screen.getByText('Office Depot · 24.99 EUR')).toBeTruthy();
    expect(screen.getByText('Old Paper Mill · 19.99 EUR')).toBeTruthy();
    expect(screen.getByText(/Supplier inactive/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit A4 copy paper' }),
    ).toBeNull();
  });

  it('lets a buyer add an item from an active supplier at a typed price', async () => {
    const api = renderAs('BUYER');
    fireEvent.press(await screen.findByRole('button', { name: 'Add item' }));
    // Only active suppliers are offered.
    fireEvent.press(
      await screen.findByRole('button', { name: 'Supplier TechWorld' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Supplier Old Paper Mill' }),
    ).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Item name'), 'USB-C dock');
    fireEvent.changeText(screen.getByLabelText('Unit price (EUR)'), '89.90');
    await pressToWrite(screen.getByRole('button', { name: 'Save item' }));

    expect(await screen.findByText('TechWorld · 89.90 EUR')).toBeTruthy();
    expect(api.createCatalogItem).toHaveBeenCalledWith('token-alice', ACME, {
      supplierId: tech.id,
      name: 'USB-C dock',
      unitPriceMinor: 8990,
    });
  });

  it('refuses to save a price that is not an amount', async () => {
    renderAs('BUYER');
    fireEvent.press(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.press(
      await screen.findByRole('button', { name: 'Supplier TechWorld' }),
    );
    fireEvent.changeText(screen.getByLabelText('Item name'), 'Dock');
    fireEvent.changeText(screen.getByLabelText('Unit price (EUR)'), '12.345');
    expect(screen.getByText('Enter a price like 24.99')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save item' }).props
        .accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('lets a buyer reprice an item of an inactive supplier without changing the supplier', async () => {
    const api = renderAs('BUYER');
    fireEvent.press(
      await screen.findByRole('button', { name: 'Edit Recycled paper' }),
    );
    const inactive = await screen.findByRole('button', {
      name: 'Supplier Old Paper Mill (inactive)',
    });
    expect(inactive.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.changeText(screen.getByLabelText('Unit price (EUR)'), '20.99');
    await pressToWrite(screen.getByRole('button', { name: 'Save item' }));

    expect(await screen.findByText('Old Paper Mill · 20.99 EUR')).toBeTruthy();
    expect(api.updateCatalogItem).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      recycled.id,
      { supplierId: oldMill.id, name: 'Recycled paper', unitPriceMinor: 2099 },
    );
  });
});
