import type {
  GoodsReceipt,
  PurchaseOrder,
  Role,
} from '@procurely/shared-types';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
const pens = catalogItem(office, 'Pens', 150);
const base = purchaseOrder(
  requisition(ACME, 'Spring stock', [{ item: pens, quantity: 4 }], {
    status: 'APPROVED',
  }),
  office,
  [{ item: pens, quantity: 4, unitPriceMinor: 150 }],
);

/** A fake API that behaves like the real one: receipts add up and move the status. */
function renderAs(role: Role) {
  let order: PurchaseOrder = base;
  const receipts: GoodsReceipt[] = [];
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    purchaseOrders: async () => [order],
    goodsReceipts: async () => receipts,
    recordGoodsReceipt: jest.fn(async (_t, _c, _id, body) => {
      const lines = order.lines.map((l) => {
        const entry = body.lines.find((e) => e.purchaseOrderLineId === l.id);
        return {
          ...l,
          receivedQuantity: l.receivedQuantity + (entry?.quantity ?? 0),
        };
      });
      const full = lines.every((l) => l.receivedQuantity === l.quantity);
      order = {
        ...order,
        lines,
        status: full ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED',
      };
      const receipt: GoodsReceipt = {
        id: `r${receipts.length}`,
        companyId: ACME,
        purchaseOrderId: order.id,
        receivedByPersonId: 'person-carol',
        receivedByName: 'Carol',
        receivedAt: '2026-10-11T08:00:00.000Z',
        lines: body.lines.map((e, i) => ({
          id: `rl${i}`,
          purchaseOrderLineId: e.purchaseOrderLineId,
          catalogItemName: 'Pens',
          quantity: e.quantity,
          note: e.note ?? null,
        })),
      };
      receipts.unshift(receipt);
      return receipt;
    }),
    closePurchaseOrder: jest.fn(async () => {
      order = {
        ...order,
        status: 'CLOSED',
        closedAt: '2026-10-11T09:00:00.000Z',
        closedByName: 'Carol',
      };
      return order;
    }),
  });
  render(
    <TestApp api={api}>
      <PurchaseOrdersScreen />
    </TestApp>,
  );
  return api;
}

const button = (name: string) => screen.findByRole('button', { name });

async function openOrder() {
  fireEvent.press(await button('Open order of Spring stock'));
  await screen.findByText('Deliveries');
}

describe('goods receipts on a purchase order', () => {
  it('lets a buyer confirm a partial then the rest, moving the status, then close the order', async () => {
    const api = renderAs('BUYER');
    await openOrder();
    expect(await screen.findByText('Status: Issued')).toBeTruthy();
    expect(await screen.findByText('Nothing received yet.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Received now of Pens'), '3');
    fireEvent.changeText(
      screen.getByLabelText('Note for Pens'),
      'one box dented',
    );
    await pressToWrite(await button('Record delivery'));
    expect(api.recordGoodsReceipt).toHaveBeenCalledWith(
      expect.anything(),
      ACME,
      base.id,
      {
        lines: [
          {
            purchaseOrderLineId: base.lines[0].id,
            quantity: 3,
            note: 'one box dented',
          },
        ],
      },
    );
    expect(await screen.findByText('Status: Partially received')).toBeTruthy();
    expect(screen.getByText('+3 × Pens (one box dented)')).toBeTruthy();
    expect(screen.getByText('Pens: 3 of 4 received')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close order' })).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Received now of Pens'), '1');
    await pressToWrite(await button('Record delivery'));
    expect(await screen.findByText('Status: Fully received')).toBeTruthy();

    await pressToWrite(await button('Close order'));
    expect(await screen.findByText('Status: Closed')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Record delivery' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close order' })).toBeNull();
  });

  it('refuses over-receiving before it is sent', async () => {
    const api = renderAs('BUYER');
    await openOrder();
    fireEvent.changeText(screen.getByLabelText('Received now of Pens'), '5');
    expect(await screen.findByText('Only 4 still expected')).toBeTruthy();
    expect(
      (await button('Record delivery')).props.accessibilityState.disabled,
    ).toBe(true);
    expect(api.recordGoodsReceipt).not.toHaveBeenCalled();
  });

  it('shows deliveries to a requester but offers no way to record one', async () => {
    renderAs('REQUESTER');
    await openOrder();
    expect(
      screen.queryByRole('button', { name: 'Record delivery' }),
    ).toBeNull();
    expect(screen.queryByLabelText('Received now of Pens')).toBeNull();
  });
});
