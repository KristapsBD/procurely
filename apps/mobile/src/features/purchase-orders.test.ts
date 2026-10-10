import { catalogItem, requisition, supplier } from '../test/fakes';
import {
  estimateTotal,
  initialLines,
  orderable,
  toOrderRequest,
} from './purchase-orders';

const office = supplier('c', 'Office Depot');
const tech = supplier('c', 'TechWorld');
const paper = catalogItem(office, 'Paper', 2499);
const laptop = catalogItem(tech, 'Laptop', 119900);
const req = requisition('c', 'Stock', [
  { item: paper, quantity: 3 },
  { item: laptop, quantity: 1 },
]);

describe('purchase order drafts', () => {
  it('starts from the requisition lines of the chosen supplier, at the requisition price', () => {
    expect(initialLines(req, [paper, laptop], office.id)).toEqual([
      { catalogItemId: paper.id, name: 'Paper', quantity: '3', price: '24.99' },
    ]);
  });

  it('offers approved requisitions that have no order yet', () => {
    const approved = { ...req, status: 'APPROVED' as const };
    const other = { ...approved, id: 'other' };
    const order = { requisitionId: other.id } as never;
    expect(
      orderable([approved, other, { ...req, id: 'draft' }], [order]),
    ).toEqual([approved]);
  });

  it('builds a request in minor units, or none while a field is invalid', () => {
    const line = { catalogItemId: paper.id, name: 'Paper' };
    expect(
      toOrderRequest('r', 's', [{ ...line, quantity: '3', price: '24,5' }]),
    ).toEqual({
      requisitionId: 'r',
      supplierId: 's',
      lines: [{ catalogItemId: paper.id, quantity: 3, unitPriceMinor: 2450 }],
    });
    for (const bad of [
      { quantity: '0', price: '1' },
      { quantity: '1.5', price: '1' },
      { quantity: '1', price: '' },
      { quantity: '1', price: '-1' },
      { quantity: '1', price: '1.234' },
    ]) {
      expect(toOrderRequest('r', 's', [{ ...line, ...bad }])).toBeNull();
    }
    expect(toOrderRequest('r', 's', [])).toBeNull();
  });

  it('totals the lines in minor units without floats', () => {
    expect(
      estimateTotal([
        { catalogItemId: 'a', name: 'A', quantity: '3', price: '4.35' },
        { catalogItemId: 'b', name: 'B', quantity: '2', price: '0.10' },
      ]),
    ).toBe(1325);
  });
});
