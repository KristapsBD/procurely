import type { PurchaseOrder, Requisition, Role } from '@procurely/shared-types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError, type Api } from '../api/client';
import {
  TestApp,
  catalogItem,
  fakeApi,
  membership,
  pressToWrite,
  purchaseOrder,
  requisition,
  supplier,
} from '../test/fakes';
import { PurchaseOrdersScreen } from './purchase-orders-screen';

const ACME = 'company-acme';
const office = supplier(ACME, 'Office Depot');
const tech = supplier(ACME, 'TechWorld');
const mill = supplier(ACME, 'Old Paper Mill', false);
const paper = catalogItem(office, 'A4 copy paper', 2499);
const pens = catalogItem(office, 'Pens', 150);
const laptop = catalogItem(tech, 'Laptop', 119900);
const approved: Requisition = requisition(
  ACME,
  'Printer paper',
  [
    { item: paper, quantity: 3 },
    { item: laptop, quantity: 1 },
  ],
  { status: 'APPROVED', actions: [] },
);
const existing = purchaseOrder(
  requisition(ACME, 'Spring stock', [{ item: pens, quantity: 4 }], {
    status: 'APPROVED',
  }),
  office,
  [{ item: pens, quantity: 4, unitPriceMinor: 140 }],
);

function renderAs(
  role: Role,
  orders: PurchaseOrder[] = [existing],
  overrides: Partial<Api> = {},
) {
  let current = orders;
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    suppliers: jest.fn(async (_t, _c, opts) =>
      opts?.selectable ? [office, tech] : [office, tech, mill],
    ),
    catalogItems: async () => [paper, pens, laptop],
    requisitions: async () => [approved],
    purchaseOrders: jest.fn(async () => current),
    createPurchaseOrder: jest.fn(async (_t, _c, body) => {
      const created = purchaseOrder(
        approved,
        office,
        body.lines.map((l) => ({
          item: [paper, pens].find((i) => i.id === l.catalogItemId)!,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
        })),
      );
      current = [created, ...current];
      return created;
    }),
    ...overrides,
  });
  render(
    <TestApp api={api}>
      <PurchaseOrdersScreen />
    </TestApp>,
  );
  return api;
}

const button = (name: string) => screen.findByRole('button', { name });
const noButton = (name: string) =>
  expect(screen.queryByRole('button', { name })).toBeNull();

describe('PurchaseOrdersScreen', () => {
  it('lists the orders with supplier and total, and opens one with its lines', async () => {
    renderAs('REQUESTER');
    expect(await screen.findByText('Spring stock')).toBeTruthy();
    expect(screen.getByText('Office Depot · 5.60 EUR · Issued')).toBeTruthy();
    fireEvent.press(await button('Open order of Spring stock'));
    expect(
      await screen.findByText('4 × Pens at 1.40 EUR = 5.60 EUR (0 received)'),
    ).toBeTruthy();
    expect(screen.getByText('Total 5.60 EUR')).toBeTruthy();
    expect(screen.getByText('Office Depot · ordered by Carol')).toBeTruthy();
  });

  it('offers no way to order to requesters and approvers', async () => {
    renderAs('APPROVER');
    await screen.findByText('Spring stock');
    noButton('New purchase order');
  });

  it('says so when there are no orders', async () => {
    renderAs('BUYER', []);
    expect(await screen.findByText('No purchase orders yet.')).toBeTruthy();
  });

  it('creates an order from an approved requisition: supplier, lines prefilled for it, editable price', async () => {
    const api = renderAs('BUYER');
    fireEvent.press(await button('New purchase order'));
    fireEvent.press(await button('Order Printer paper'));
    fireEvent.press(await button('Supplier Office Depot'));
    // Only the requisition's lines of this supplier, at the requisition's price.
    expect(
      await screen.findByLabelText('Quantity of A4 copy paper'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Quantity of Laptop')).toBeNull();
    expect(screen.getByText('Total 74.97 EUR')).toBeTruthy();
    // The supplier's other items can be added; an inactive supplier is not offered.
    expect(
      screen.queryByRole('button', { name: 'Supplier Old Paper Mill' }),
    ).toBeNull();
    fireEvent.press(await button('Add Pens'));
    fireEvent.changeText(
      screen.getByLabelText('Unit price of A4 copy paper (EUR)'),
      '24,00',
    );
    fireEvent.changeText(screen.getByLabelText('Quantity of Pens'), '10');
    expect(screen.getByText('Total 87.00 EUR')).toBeTruthy();

    await pressToWrite(await button('Create purchase order'));

    expect(api.createPurchaseOrder).toHaveBeenCalledWith('token-alice', ACME, {
      requisitionId: approved.id,
      supplierId: office.id,
      lines: [
        { catalogItemId: paper.id, quantity: 3, unitPriceMinor: 2400 },
        { catalogItemId: pens.id, quantity: 10, unitPriceMinor: 150 },
      ],
    });
    expect(await screen.findByText('Back to purchase orders')).toBeTruthy();
    expect(screen.getByText('Total 87.00 EUR')).toBeTruthy();
  });

  it('does not offer a requisition that already has an order', async () => {
    renderAs('ADMIN', [
      purchaseOrder(approved, office, [
        { item: paper, quantity: 3, unitPriceMinor: 2499 },
      ]),
    ]);
    fireEvent.press(await button('New purchase order'));
    expect(
      await screen.findByText(
        'No approved requisition is waiting to be ordered.',
      ),
    ).toBeTruthy();
  });

  it('keeps Create disabled until every quantity and price is valid', async () => {
    renderAs('BUYER');
    fireEvent.press(await button('New purchase order'));
    fireEvent.press(await button('Order Printer paper'));
    fireEvent.press(await button('Supplier Office Depot'));
    await screen.findByLabelText('Quantity of A4 copy paper');
    const create = await button('Create purchase order');
    expect(create.props.accessibilityState.disabled).toBe(false);
    fireEvent.changeText(
      screen.getByLabelText('Quantity of A4 copy paper'),
      '0',
    );
    expect(
      (await button('Create purchase order')).props.accessibilityState.disabled,
    ).toBe(true);
    fireEvent.changeText(
      screen.getByLabelText('Quantity of A4 copy paper'),
      '2',
    );
    fireEvent.changeText(
      screen.getByLabelText('Unit price of A4 copy paper (EUR)'),
      'abc',
    );
    expect(
      await screen.findByText('Enter an amount such as 24.99'),
    ).toBeTruthy();
    expect(
      (await button('Create purchase order')).props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('shows the API’s reason when it refuses, such as a supplier deactivated meanwhile', async () => {
    renderAs('BUYER', [existing], {
      createPurchaseOrder: async () => {
        throw new ApiError(
          409,
          'Supplier Office Depot is inactive and cannot be chosen',
        );
      },
    });
    fireEvent.press(await button('New purchase order'));
    fireEvent.press(await button('Order Printer paper'));
    fireEvent.press(await button('Supplier Office Depot'));
    await screen.findByLabelText('Quantity of A4 copy paper');
    await pressToWrite(await button('Create purchase order'));
    expect(
      await screen.findByText(
        'Supplier Office Depot is inactive and cannot be chosen',
      ),
    ).toBeTruthy();
  });
});
