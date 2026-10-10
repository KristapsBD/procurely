import {
  purchaseOrder,
  requisition,
  supplier,
  catalogItem,
} from '../test/fakes';
import {
  emptyDrafts,
  lineIssue,
  parseReceiptQuantity,
  toReceiptRequest,
} from './goods-receipts';

const office = supplier('c', 'Office Depot');
const pens = catalogItem(office, 'Pens', 150);
const order = purchaseOrder(
  requisition('c', 'Stock', [{ item: pens, quantity: 4 }]),
  office,
  [{ item: pens, quantity: 4, unitPriceMinor: 150 }],
);
const received = {
  ...order,
  lines: order.lines.map((l) => ({ ...l, receivedQuantity: 3 })),
};
const draft = (o: typeof order, quantity: string, note = '') => [
  { ...emptyDrafts(o)[0], quantity, note },
];

describe('parseReceiptQuantity', () => {
  it('accepts whole numbers, negative to correct, and refuses zero and fractions', () => {
    expect(parseReceiptQuantity(' 3 ')).toBe(3);
    expect(parseReceiptQuantity('-2')).toBe(-2);
    expect(parseReceiptQuantity('0')).toBeNull();
    expect(parseReceiptQuantity('1.5')).toBeNull();
    expect(parseReceiptQuantity('x')).toBeNull();
  });
});

describe('toReceiptRequest', () => {
  it('sends only the lines with a quantity, with a trimmed note', () => {
    expect(toReceiptRequest(order, draft(order, '2', ' cracked '))).toEqual({
      lines: [
        {
          purchaseOrderLineId: order.lines[0].id,
          quantity: 2,
          note: 'cracked',
        },
      ],
    });
    expect(toReceiptRequest(order, draft(order, '2'))).toEqual({
      lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: 2 }],
    });
  });

  it('is null while nothing is entered', () => {
    expect(toReceiptRequest(order, draft(order, ''))).toBeNull();
  });

  it('refuses to receive more than is still expected', () => {
    expect(toReceiptRequest(order, draft(order, '5'))).toBeNull();
    expect(lineIssue(order, draft(order, '5')[0])).toBe(
      'Only 4 still expected',
    );
    expect(toReceiptRequest(received, draft(received, '2'))).toBeNull();
    expect(toReceiptRequest(received, draft(received, '1'))).not.toBeNull();
  });

  it('needs a note for a correction and refuses one below zero', () => {
    expect(toReceiptRequest(received, draft(received, '-1'))).toBeNull();
    expect(
      toReceiptRequest(received, draft(received, '-1', 'miscount')),
    ).not.toBeNull();
    expect(lineIssue(received, draft(received, '-4', 'x')[0])).toBe(
      'Only 3 received so far',
    );
  });
});
