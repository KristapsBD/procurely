import type { INestApplication } from '@nestjs/common';
import type {
  AuditEntry,
  CatalogItem,
  CostCenter,
  GoodsReceipt,
  PurchaseOrder,
  Requisition,
} from '@procurely/shared-types';
import {
  CATALOG_ITEM,
  COMPANY,
  PERSON,
  SUPPLIER,
} from '../../prisma/seed-data';
import { TenantDb } from '../../src/tenancy/tenant-db.service';
import { Actor, startApp } from './harness';

const MAIN: string = COMPANY.main;

// Main company: alice requester, bob approver, carol buyer, dave admin. Each test makes the
// order it needs: two lines, 5 paper and 2 pens.
describe('goods receipts', () => {
  let app: INestApplication;
  let db: TenantDb;
  let ops: string;
  let pens: CatalogItem;
  beforeAll(async () => {
    app = await startApp();
    db = app.get(TenantDb);
    ops = (
      (await (await as(PERSON.alice)).listCostCenters(MAIN).expect(200))
        .body as CostCenter[]
    ).find((c) => c.code === 'OPS')!.id;
    pens = (
      await (
        await as(PERSON.carol)
      )
        .createCatalogItem(MAIN, {
          supplierId: SUPPLIER.mainOffice,
          name: 'Receipt test pens',
          unitPriceMinor: 150,
        })
        .expect(201)
    ).body as CatalogItem;
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);
  const carolScope = { personId: PERSON.carol, companyId: MAIN };

  async function order(): Promise<PurchaseOrder> {
    const alice = await as(PERSON.alice);
    const dave = await as(PERSON.dave);
    const draft = (
      await alice
        .createRequisition(MAIN, {
          costCenterId: ops,
          justification: 'Paper and pens',
          lines: [{ catalogItemId: CATALOG_ITEM.mainPaper, quantity: 5 }],
        })
        .expect(201)
    ).body as Requisition;
    await alice.submitRequisition(MAIN, draft.id).expect(200);
    await dave.approveRequisition(MAIN, draft.id).expect(200);
    const carol = await as(PERSON.carol);
    return (
      await carol
        .createPurchaseOrder(MAIN, {
          requisitionId: draft.id,
          supplierId: SUPPLIER.mainOffice,
          lines: [
            {
              catalogItemId: CATALOG_ITEM.mainPaper,
              quantity: 5,
              unitPriceMinor: 2400,
            },
            { catalogItemId: pens.id, quantity: 2, unitPriceMinor: 150 },
          ],
        })
        .expect(201)
    ).body as PurchaseOrder;
  }

  const entry = (
    po: PurchaseOrder,
    line: 0 | 1,
    quantity: number,
    note?: string,
  ) => ({
    purchaseOrderLineId: po.lines[line].id,
    quantity,
    ...(note === undefined ? {} : { note }),
  });
  /** Sends the receipt when `.expect(status)` is called, like a supertest request. */
  const receive = async (
    po: PurchaseOrder,
    lines: object[],
    who: string = PERSON.carol,
  ) => {
    const actor = await as(who);
    return {
      expect: (status: number) =>
        actor.recordGoodsReceipt(MAIN, po.id, { lines }).expect(status),
    };
  };
  const reload = async (po: PurchaseOrder) =>
    (await (await as(PERSON.carol)).getPurchaseOrder(MAIN, po.id).expect(200))
      .body as PurchaseOrder;
  const fullyReceive = async (po: PurchaseOrder) => {
    await (await receive(po, [entry(po, 0, 5), entry(po, 1, 2)])).expect(201);
  };

  it('starts an order as issued with nothing received', async () => {
    const po = await order();
    expect(po.status).toBe('ISSUED');
    expect(po.closedAt).toBeNull();
    expect(po.lines.map((l) => l.receivedQuantity)).toEqual([0, 0]);
  });

  describe('recording', () => {
    it('records the quantity per line with an optional note and moves the order to partially received', async () => {
      const po = await order();
      const res = await (
        await receive(po, [entry(po, 0, 2, 'one box crushed')])
      ).expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        companyId: MAIN,
        purchaseOrderId: po.id,
        receivedByPersonId: PERSON.carol,
        receivedByName: expect.any(String),
        receivedAt: expect.any(String),
        lines: [
          {
            id: expect.any(String),
            purchaseOrderLineId: po.lines[0].id,
            catalogItemName: po.lines[0].catalogItemName,
            quantity: 2,
            note: 'one box crushed',
          },
        ],
      });
      const after = await reload(po);
      expect(after.status).toBe('PARTIALLY_RECEIVED');
      expect(after.lines.map((l) => l.receivedQuantity)).toEqual([2, 0]);
    });

    it('moves the order to fully received once every line is complete, across several receipts', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 5)])).expect(201);
      expect((await reload(po)).status).toBe('PARTIALLY_RECEIVED');
      await (await receive(po, [entry(po, 1, 1)])).expect(201);
      expect((await reload(po)).status).toBe('PARTIALLY_RECEIVED');
      await (await receive(po, [entry(po, 1, 1, 'second pen')])).expect(201);
      const after = await reload(po);
      expect(after.status).toBe('FULLY_RECEIVED');
      const list = (
        await (
          await as(PERSON.carol)
        )
          .listGoodsReceipts(MAIN, po.id)
          .expect(200)
      ).body as GoodsReceipt[];
      expect(list).toHaveLength(3);
    });

    it('lets an admin record a receipt', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 1)], PERSON.dave)).expect(201);
    });

    it('rejects over-receiving, in one receipt and across receipts, leaving no trace', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 6)])).expect(409);
      await (await receive(po, [entry(po, 0, 4)])).expect(201);
      await (await receive(po, [entry(po, 0, 2)])).expect(409);
      await (await receive(po, [entry(po, 1, 1), entry(po, 0, 2)])).expect(409);
      const after = await reload(po);
      expect(after.lines.map((l) => l.receivedQuantity)).toEqual([4, 0]);
      const list = (
        await (
          await as(PERSON.carol)
        )
          .listGoodsReceipts(MAIN, po.id)
          .expect(200)
      ).body as GoodsReceipt[];
      expect(list).toHaveLength(1);
    });

    it('serializes concurrent receipts so the ordered quantity is never exceeded', async () => {
      const po = await order();
      const actor = await as(PERSON.carol);
      const results = await Promise.all(
        [0, 1, 2, 3, 4, 5].map(
          async () =>
            (
              await actor.recordGoodsReceipt(MAIN, po.id, {
                lines: [entry(po, 0, 1)],
              })
            ).status,
        ),
      );
      expect(results.filter((s) => s === 201)).toHaveLength(5);
      expect(results.filter((s) => s === 409)).toHaveLength(1);
      expect((await reload(po)).lines[0].receivedQuantity).toBe(5);
    });

    it('corrects an earlier entry with a later negative entry that needs a note', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 5)])).expect(201);
      expect((await reload(po)).status).toBe('PARTIALLY_RECEIVED');
      await (await receive(po, [entry(po, 1, 2)])).expect(201);
      expect((await reload(po)).status).toBe('FULLY_RECEIVED');
      await (await receive(po, [entry(po, 0, -2)])).expect(400);
      await (
        await receive(po, [entry(po, 0, -2, 'only 3 boxes counted')])
      ).expect(201);
      const after = await reload(po);
      expect(after.status).toBe('PARTIALLY_RECEIVED');
      expect(after.lines.map((l) => l.receivedQuantity)).toEqual([3, 2]);
      await (await receive(po, [entry(po, 0, -4, 'too many')])).expect(409);
    });

    it('validates the input', async () => {
      const po = await order();
      const other = await order();
      await (await receive(po, [])).expect(400);
      await (await receive(po, [entry(po, 0, 0)])).expect(400);
      await (await receive(po, [entry(po, 0, 1.5)])).expect(400);
      await (await receive(po, [entry(po, 0, 1), entry(po, 0, 1)])).expect(400);
      await (await receive(po, [entry(po, 0, 1, 'x'.repeat(501))])).expect(400);
      await (
        await receive(po, [{ purchaseOrderLineId: 'nope', quantity: 1 }])
      ).expect(400);
      await (await receive(po, [entry(other, 0, 1)])).expect(400);
      expect((await reload(po)).status).toBe('ISSUED');
    });

    it('writes an audit entry with the status change', async () => {
      const po = await order();
      const res = await (
        await receive(po, [entry(po, 0, 5, 'ok'), entry(po, 1, 2)])
      ).expect(201);
      const log = (await (await as(PERSON.dave)).auditLog(MAIN))
        .body as AuditEntry[];
      expect(log.find((e) => e.entityId === res.body.id)).toMatchObject({
        action: 'goods_receipt.recorded',
        actorPersonId: PERSON.carol,
        entityType: 'goods_receipt',
        details: {
          purchaseOrderId: po.id,
          statusBefore: 'ISSUED',
          statusAfter: 'FULLY_RECEIVED',
          lines: [
            { purchaseOrderLineId: po.lines[0].id, quantity: 5, note: 'ok' },
            { purchaseOrderLineId: po.lines[1].id, quantity: 2, note: null },
          ],
        },
      });
    });
  });

  describe('who may', () => {
    it('refuses requesters and approvers with 403, and hides the order from outsiders', async () => {
      const po = await order();
      for (const who of [PERSON.alice, PERSON.bob]) {
        await (await receive(po, [entry(po, 0, 1)], who)).expect(403);
        await (await as(who)).closePurchaseOrder(MAIN, po.id).expect(403);
      }
      await (await receive(po, [entry(po, 0, 1)], PERSON.gustav)).expect(404);
      await (
        await as(PERSON.gustav)
      )
        .listGoodsReceipts(MAIN, po.id)
        .expect(404);
    });

    it('lets the requester of the requisition read the receipts', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 1)])).expect(201);
      const list = (
        await (
          await as(PERSON.alice)
        )
          .listGoodsReceipts(MAIN, po.id)
          .expect(200)
      ).body as GoodsReceipt[];
      expect(list).toHaveLength(1);
    });
  });

  describe('closing', () => {
    it('closes a fully received order, writes an audit entry and refuses further receipts', async () => {
      const po = await order();
      await fullyReceive(po);
      const carol = await as(PERSON.carol);
      const res = await carol.closePurchaseOrder(MAIN, po.id).expect(201);
      expect(res.body).toMatchObject({
        id: po.id,
        status: 'CLOSED',
        closedAt: expect.any(String),
        closedByName: expect.any(String),
      });
      await (await receive(po, [entry(po, 0, -1, 'late fix')])).expect(409);
      await carol.closePurchaseOrder(MAIN, po.id).expect(409);
      const log = (await (await as(PERSON.dave)).auditLog(MAIN))
        .body as AuditEntry[];
      expect(
        log.find(
          (e) => e.action === 'purchase_order.closed' && e.entityId === po.id,
        ),
      ).toMatchObject({
        actorPersonId: PERSON.carol,
        details: { statusBefore: 'FULLY_RECEIVED', statusAfter: 'CLOSED' },
      });
    });

    it('refuses to close an order that is not fully received', async () => {
      const po = await order();
      const carol = await as(PERSON.carol);
      await carol.closePurchaseOrder(MAIN, po.id).expect(409);
      await (await receive(po, [entry(po, 0, 5)])).expect(201);
      await carol.closePurchaseOrder(MAIN, po.id).expect(409);
      expect((await reload(po)).status).toBe('PARTIALLY_RECEIVED');
    });
  });

  describe('the database', () => {
    it('refuses to change or delete a receipt or its lines, even for a buyer', async () => {
      const po = await order();
      await (await receive(po, [entry(po, 0, 2)])).expect(201);
      await expect(
        db.run(carolScope, (tx) =>
          tx.goodsReceiptLine.updateMany({ data: { quantity: 1 } }),
        ),
      ).rejects.toThrow();
      await expect(
        db.run(carolScope, (tx) => tx.goodsReceiptLine.deleteMany({})),
      ).rejects.toThrow();
      await expect(
        db.run(carolScope, (tx) => tx.goodsReceipt.deleteMany({})),
      ).rejects.toThrow();
      await expect(
        db.run(carolScope, (tx) => tx.purchaseOrderClosure.deleteMany({})),
      ).rejects.toThrow();
      expect((await reload(po)).lines[0].receivedQuantity).toBe(2);
    });

    it('refuses over-receiving, a closed order and an early closure even when the service is bypassed', async () => {
      const po = await order();
      const insertReceipt = (quantity: number, line = 0) =>
        db.run(carolScope, async (tx) => {
          const { id } = await tx.goodsReceipt.create({
            data: {
              companyId: MAIN,
              purchaseOrderId: po.id,
              receivedByPersonId: PERSON.carol,
            },
          });
          await tx.goodsReceiptLine.createMany({
            data: [
              {
                companyId: MAIN,
                goodsReceiptId: id,
                purchaseOrderId: po.id,
                purchaseOrderLineId: po.lines[line].id,
                quantity,
                note: 'x',
              },
            ],
          });
        });
      await expect(insertReceipt(6)).rejects.toThrow(/over-receiving/);
      await expect(
        db.run(carolScope, (tx) =>
          tx.purchaseOrderClosure.createMany({
            data: [
              {
                companyId: MAIN,
                purchaseOrderId: po.id,
                closedByPersonId: PERSON.carol,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/not fully received/);
      await fullyReceive(po);
      await (
        await as(PERSON.carol)
      )
        .closePurchaseOrder(MAIN, po.id)
        .expect(201);
      await expect(insertReceipt(-1)).rejects.toThrow(/closed|row-level/);
    });

    it('refuses a receipt line whose order line belongs to another order, and a receipt by someone else', async () => {
      const po = await order();
      const other = await order();
      await expect(
        db.run(carolScope, async (tx) => {
          const { id } = await tx.goodsReceipt.create({
            data: {
              companyId: MAIN,
              purchaseOrderId: po.id,
              receivedByPersonId: PERSON.carol,
            },
          });
          await tx.goodsReceiptLine.createMany({
            data: [
              {
                companyId: MAIN,
                goodsReceiptId: id,
                purchaseOrderId: po.id,
                purchaseOrderLineId: other.lines[0].id,
                quantity: 1,
              },
            ],
          });
        }),
      ).rejects.toThrow();
      await expect(
        db.run(carolScope, (tx) =>
          tx.goodsReceipt.create({
            data: {
              companyId: MAIN,
              purchaseOrderId: po.id,
              receivedByPersonId: PERSON.dave,
            },
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('refuses lines added to an existing receipt in a later transaction', async () => {
      const po = await order();
      const receipt = (await (await receive(po, [entry(po, 0, 1)])).expect(201))
        .body as GoodsReceipt;
      await expect(
        db.run(carolScope, (tx) =>
          tx.goodsReceiptLine.createMany({
            data: [
              {
                companyId: MAIN,
                goodsReceiptId: receipt.id,
                purchaseOrderId: po.id,
                purchaseOrderLineId: po.lines[1].id,
                quantity: 1,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
