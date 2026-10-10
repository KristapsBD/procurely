import type { INestApplication } from '@nestjs/common';
import type {
  AuditEntry,
  CatalogItem,
  CostCenter,
  Member,
  PurchaseOrder,
  Requisition,
  Supplier,
} from '@procurely/shared-types';
import {
  CATALOG_ITEM,
  COMPANY,
  PERSON,
  PURCHASE_ORDER,
  SUPPLIER,
} from '../../prisma/seed-data';
import { TenantDb } from '../../src/tenancy/tenant-db.service';
import { Actor, startApp } from './harness';

const MISSING = '11111111-1111-4111-8111-111111111111';
const MAIN: string = COMPANY.main;
const MEGA: string = COMPANY.large;

// Main company: alice requester, bob approver, carol buyer, dave admin (no approval rules, so an
// admin decides). Megacorp has a 500.00 rule for approvers and a 5000.00 rule for admins. Each
// test makes the requisitions and orders it needs.
describe('purchase orders', () => {
  let app: INestApplication;
  let db: TenantDb;
  let ops: string;
  beforeAll(async () => {
    app = await startApp();
    db = app.get(TenantDb);
    ops = (
      (await (await as(PERSON.alice)).listCostCenters(MAIN).expect(200))
        .body as CostCenter[]
    ).find((c) => c.code === 'OPS')!.id;
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  /** An approved requisition of the main company, requested by `requester`. */
  async function approvedRequisition(
    requester?: Actor,
    lines = [{ catalogItemId: CATALOG_ITEM.mainPaper, quantity: 3 }],
  ) {
    const alice = requester ?? (await as(PERSON.alice));
    const dave = await as(PERSON.dave);
    const draft = (
      await alice
        .createRequisition(MAIN, {
          costCenterId: ops,
          justification: 'Paper for the printers',
          lines,
        })
        .expect(201)
    ).body as Requisition;
    await alice.submitRequisition(MAIN, draft.id).expect(200);
    await dave.approveRequisition(MAIN, draft.id).expect(200);
    return draft;
  }

  const paperOrder = (requisitionId: string, extra: object = {}) => ({
    requisitionId,
    supplierId: SUPPLIER.mainOffice,
    lines: [
      {
        catalogItemId: CATALOG_ITEM.mainPaper,
        quantity: 3,
        unitPriceMinor: 2400,
      },
    ],
    ...extra,
  });

  async function orderOf(requisitionId?: string) {
    const requisition = requisitionId ?? (await approvedRequisition()).id;
    const carol = await as(PERSON.carol);
    const res = await carol
      .createPurchaseOrder(MAIN, paperOrder(requisition))
      .expect(201);
    return res.body as PurchaseOrder;
  }

  async function otherPerson(email: string, role: string, company = MAIN) {
    const admin = await as(company === MAIN ? PERSON.dave : PERSON.gustav);
    const invited = await admin
      .inviteMember(company, { email, role })
      .expect(201);
    return as((invited.body as Member).personId);
  }

  describe('creating', () => {
    it('lets a buyer order an approved requisition, with a computed total in minor units, and writes an audit entry', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const pens = (
        await carol
          .createCatalogItem(MAIN, {
            supplierId: SUPPLIER.mainOffice,
            name: `Pens ${requisition.id}`,
            unitPriceMinor: 150,
          })
          .expect(201)
      ).body as CatalogItem;

      const res = await carol
        .createPurchaseOrder(MAIN, {
          requisitionId: requisition.id,
          supplierId: SUPPLIER.mainOffice,
          lines: [
            {
              catalogItemId: CATALOG_ITEM.mainPaper,
              quantity: 3,
              unitPriceMinor: 2400,
            },
            { catalogItemId: pens.id, quantity: 10, unitPriceMinor: 99 },
          ],
        })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        companyId: MAIN,
        requisitionId: requisition.id,
        requisitionJustification: 'Paper for the printers',
        supplierId: SUPPLIER.mainOffice,
        supplierName: 'Office Depot',
        createdByPersonId: PERSON.carol,
        createdByName: 'Carol Buyer',
        createdAt: expect.any(String),
        lines: [
          {
            id: expect.any(String),
            catalogItemId: CATALOG_ITEM.mainPaper,
            catalogItemName: 'A4 copy paper, box of 5 reams',
            quantity: 3,
            unitPriceMinor: 2400,
            amountMinor: 7200,
            receivedQuantity: 0,
          },
          {
            id: expect.any(String),
            catalogItemId: pens.id,
            catalogItemName: pens.name,
            quantity: 10,
            unitPriceMinor: 99,
            amountMinor: 990,
            receivedQuantity: 0,
          },
        ],
        totalMinor: 8190,
        status: 'ISSUED',
        closedAt: null,
        closedByName: null,
      });
      expect(
        (await carol.getPurchaseOrder(MAIN, res.body.id).expect(200)).body,
      ).toEqual(res.body);

      const log = (await (await as(PERSON.dave)).auditLog(MAIN))
        .body as AuditEntry[];
      const entry = log.find((e) => e.entityId === res.body.id)!;
      expect(entry).toMatchObject({
        action: 'purchase_order.created',
        actorPersonId: PERSON.carol,
        entityType: 'purchase_order',
        details: {
          requisitionId: requisition.id,
          supplierId: SUPPLIER.mainOffice,
          totalMinor: 8190,
        },
      });
    });

    it('lets an admin order too', async () => {
      const requisition = await approvedRequisition();
      const dave = await as(PERSON.dave);
      await dave
        .createPurchaseOrder(MAIN, paperOrder(requisition.id))
        .expect(201);
    });

    it('refuses a requisition that is not approved, whatever the role', async () => {
      const alice = await as(PERSON.alice);
      const dave = await as(PERSON.dave);
      const carol = await as(PERSON.carol);
      const body = {
        costCenterId: ops,
        justification: 'Not yet approved',
        lines: [{ catalogItemId: CATALOG_ITEM.mainPaper, quantity: 1 }],
      };
      const draft = (await alice.createRequisition(MAIN, body).expect(201))
        .body as Requisition;
      const submitted = (await alice.createRequisition(MAIN, body).expect(201))
        .body as Requisition;
      await alice.submitRequisition(MAIN, submitted.id).expect(200);
      const rejected = (await alice.createRequisition(MAIN, body).expect(201))
        .body as Requisition;
      await alice.submitRequisition(MAIN, rejected.id).expect(200);
      await dave
        .rejectRequisition(MAIN, rejected.id, { reason: 'No budget' })
        .expect(200);
      const cancelled = (await alice.createRequisition(MAIN, body).expect(201))
        .body as Requisition;
      await alice.cancelRequisition(MAIN, cancelled.id).expect(200);

      for (const r of [draft, submitted, rejected, cancelled]) {
        // An admin reads every requisition, so the refusal names the status.
        await dave.createPurchaseOrder(MAIN, paperOrder(r.id)).expect(409);
        // A buyer reads only approved ones: the others do not exist for them.
        await carol.createPurchaseOrder(MAIN, paperOrder(r.id)).expect(404);
      }
      await carol.createPurchaseOrder(MAIN, paperOrder(MISSING)).expect(404);
      const orders = (await dave.listPurchaseOrders(MAIN).expect(200))
        .body as PurchaseOrder[];
      expect(orders.map((o) => o.requisitionId)).not.toEqual(
        expect.arrayContaining([draft.id]),
      );
    });

    it('converts a requisition once: a second order for it is refused, even by another buyer or an admin', async () => {
      const requisition = await approvedRequisition();
      const first = await orderOf(requisition.id);
      const carol = await as(PERSON.carol);
      const dave = await as(PERSON.dave);
      const otherBuyer = await otherPerson(
        `second-buyer-${requisition.id}@procurely.test`,
        'BUYER',
      );
      for (const buyer of [carol, dave, otherBuyer]) {
        const res = await buyer
          .createPurchaseOrder(MAIN, paperOrder(requisition.id))
          .expect(409);
        expect(res.body.message).toMatch(/already has a purchase order/);
      }
      const orders = (await carol.listPurchaseOrders(MAIN).expect(200))
        .body as PurchaseOrder[];
      expect(orders.filter((o) => o.requisitionId === requisition.id)).toEqual([
        first,
      ]);
    });

    it('refuses concurrent orders for one requisition, creating exactly one', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const dave = await as(PERSON.dave);
      const results = await Promise.all(
        [carol, dave, carol, dave].map((a) =>
          a.createPurchaseOrder(MAIN, paperOrder(requisition.id)),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      const orders = (await carol.listPurchaseOrders(MAIN).expect(200))
        .body as PurchaseOrder[];
      expect(
        orders.filter((o) => o.requisitionId === requisition.id),
      ).toHaveLength(1);
    });

    it('refuses an inactive supplier on the server, whether it was inactive from the start or deactivated after approval', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const res = await carol
        .createPurchaseOrder(MAIN, {
          requisitionId: requisition.id,
          supplierId: SUPPLIER.mainInactive,
          lines: [
            {
              catalogItemId: CATALOG_ITEM.mainOldPaper,
              quantity: 1,
              unitPriceMinor: 1999,
            },
          ],
        })
        .expect(409);
      expect(res.body.message).toMatch(/inactive/);

      const supplier = (
        await carol
          .createSupplier(MAIN, { name: `Fading ${requisition.id}` })
          .expect(201)
      ).body as Supplier;
      const item = (
        await carol
          .createCatalogItem(MAIN, {
            supplierId: supplier.id,
            name: 'Fading item',
            unitPriceMinor: 500,
          })
          .expect(201)
      ).body as CatalogItem;
      await carol
        .updateSupplier(MAIN, supplier.id, { active: false })
        .expect(200);
      await carol
        .createPurchaseOrder(MAIN, {
          requisitionId: requisition.id,
          supplierId: supplier.id,
          lines: [{ catalogItemId: item.id, quantity: 1, unitPriceMinor: 500 }],
        })
        .expect(409);
      // The requisition stays convertible, for an active supplier.
      await carol
        .createPurchaseOrder(MAIN, paperOrder(requisition.id))
        .expect(201);
    });

    it('refuses a supplier of another company or none, and items that are not the supplier’s', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, { supplierId: SUPPLIER.sekOffice }),
        )
        .expect(400);
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, { supplierId: MISSING }),
        )
        .expect(400);
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, { supplierId: SUPPLIER.mainTech }),
        )
        .expect(400);
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, {
            lines: [
              {
                catalogItemId: CATALOG_ITEM.sekPaper,
                quantity: 1,
                unitPriceMinor: 1,
              },
            ],
          }),
        )
        .expect(400);
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, {
            lines: [{ catalogItemId: MISSING, quantity: 1, unitPriceMinor: 1 }],
          }),
        )
        .expect(400);
    });

    it('refuses malformed lines', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const line = {
        catalogItemId: CATALOG_ITEM.mainPaper,
        quantity: 1,
        unitPriceMinor: 100,
      };
      const bad = [
        { lines: [] },
        { lines: [line, line] },
        { lines: [{ ...line, quantity: 0 }] },
        { lines: [{ ...line, quantity: 1.5 }] },
        { lines: [{ ...line, unitPriceMinor: -1 }] },
        { lines: [{ ...line, unitPriceMinor: 10.5 }] },
        { lines: [{ ...line, unitPriceMinor: '100' }] },
        {
          lines: [
            { ...line, quantity: 2 ** 31 - 1, unitPriceMinor: 2 ** 31 - 1 },
          ],
        },
        { lines: 'nope' },
        { requisitionId: 'not-a-uuid' },
        { supplierId: undefined },
      ];
      for (const extra of bad) {
        await carol
          .createPurchaseOrder(MAIN, paperOrder(requisition.id, extra))
          .expect(400);
      }
      expect(
        (await carol.listPurchaseOrders(MAIN).expect(200)).body.filter(
          (o: PurchaseOrder) => o.requisitionId === requisition.id,
        ),
      ).toEqual([]);
    });

    it('allows a zero unit price and does not tie the order to the requisition’s prices', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const res = await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, {
            lines: [
              {
                catalogItemId: CATALOG_ITEM.mainPaper,
                quantity: 1,
                unitPriceMinor: 0,
              },
            ],
          }),
        )
        .expect(201);
      expect(res.body.totalMinor).toBe(0);
    });

    it('is refused for requesters and approvers, who also cannot read the requisition of a stranger', async () => {
      const requisition = await approvedRequisition();
      for (const person of [PERSON.alice, PERSON.bob]) {
        const actor = await as(person);
        await actor
          .createPurchaseOrder(MAIN, paperOrder(requisition.id))
          .expect(403);
      }
      const orders = (
        await (await as(PERSON.dave)).listPurchaseOrders(MAIN).expect(200)
      ).body as PurchaseOrder[];
      expect(orders.filter((o) => o.requisitionId === requisition.id)).toEqual(
        [],
      );
    });

    it('is refused for deactivated members, people with no company, and members of other companies', async () => {
      const requisition = await approvedRequisition();
      for (const person of [
        PERSON.oscar,
        PERSON.nomad,
        PERSON.mallory,
        PERSON.erik,
      ]) {
        const actor = await as(person);
        const res = await actor.createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id),
        );
        expect([403, 404]).toContain(res.status);
      }
    });

    it('creates the order and its audit entry together or not at all', async () => {
      const requisition = await approvedRequisition();
      const carol = await as(PERSON.carol);
      const before = (await (await as(PERSON.dave)).auditLog(MAIN))
        .body as AuditEntry[];
      await carol
        .createPurchaseOrder(
          MAIN,
          paperOrder(requisition.id, { supplierId: SUPPLIER.sekOffice }),
        )
        .expect(400);
      const after = (await (await as(PERSON.dave)).auditLog(MAIN))
        .body as AuditEntry[];
      expect(after.length).toBe(before.length);
    });
  });

  describe('who reads which orders', () => {
    it('shows buyers and admins every order of the company, and nothing of other companies', async () => {
      const order = await orderOf();
      for (const person of [PERSON.carol, PERSON.dave]) {
        const actor = await as(person);
        const list = (await actor.listPurchaseOrders(MAIN).expect(200))
          .body as PurchaseOrder[];
        expect(list.map((o) => o.id)).toContain(order.id);
        expect(list.every((o) => o.companyId === MAIN)).toBe(true);
        await actor.getPurchaseOrder(MAIN, order.id).expect(200);
        await actor
          .getPurchaseOrder(MAIN, PURCHASE_ORDER.fridaPaper)
          .expect(404);
      }
      const erik = await as(PERSON.erik);
      expect(
        (
          (await erik.listPurchaseOrders(COMPANY.sek).expect(200))
            .body as PurchaseOrder[]
        ).map((o) => o.id),
      ).toEqual(expect.arrayContaining([PURCHASE_ORDER.fridaPaper]));
      await erik.getPurchaseOrder(COMPANY.sek, order.id).expect(404);
    });

    it('lists newest first', async () => {
      const first = await orderOf();
      const second = await orderOf();
      const carol = await as(PERSON.carol);
      const ids = (
        (await carol.listPurchaseOrders(MAIN).expect(200))
          .body as PurchaseOrder[]
      ).map((o) => o.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    });

    it('shows a requester only the orders of their own requisitions', async () => {
      const alice = await as(PERSON.alice);
      const mine = await orderOf((await approvedRequisition(alice)).id);
      const stranger = await otherPerson(
        `stranger-${mine.id}@procurely.test`,
        'REQUESTER',
      );
      const theirs = await orderOf((await approvedRequisition(stranger)).id);

      const aliceList = (await alice.listPurchaseOrders(MAIN).expect(200))
        .body as PurchaseOrder[];
      expect(aliceList.map((o) => o.id)).toContain(mine.id);
      expect(aliceList.map((o) => o.id)).not.toContain(theirs.id);
      expect(
        (await alice.getPurchaseOrder(MAIN, mine.id).expect(200)).body,
      ).toEqual(mine);
      await alice.getPurchaseOrder(MAIN, theirs.id).expect(404);

      const strangerList = (await stranger.listPurchaseOrders(MAIN).expect(200))
        .body as PurchaseOrder[];
      expect(strangerList.map((o) => o.id)).toEqual([theirs.id]);
    });

    it('shows an approver only the orders of requisitions they decided', async () => {
      const gustav = await as(PERSON.gustav);
      const supplier = (
        await gustav
          .createSupplier(MEGA, { name: `Heavy ${Date.now()}` })
          .expect(201)
      ).body as Supplier;
      const item = (
        await gustav
          .createCatalogItem(MEGA, {
            supplierId: supplier.id,
            name: 'Press',
            unitPriceMinor: 150000,
          })
          .expect(201)
      ).body as CatalogItem;
      const plant = (
        (await gustav.listCostCenters(MEGA).expect(200)).body as CostCenter[]
      ).find((c) => c.code === 'PLANT1')!.id;
      const buyer = await otherPerson(
        `mega-buyer-${supplier.id}@procurely.test`,
        'BUYER',
        MEGA,
      );
      const ivan = await as(PERSON.ivan);
      const hanna = await as(PERSON.hanna);
      const otherApprover = await otherPerson(
        `mega-approver-${supplier.id}@procurely.test`,
        'APPROVER',
        MEGA,
      );

      const requisition = (
        await ivan
          .createRequisition(MEGA, {
            costCenterId: plant,
            justification: 'A press',
            lines: [{ catalogItemId: item.id, quantity: 1 }],
          })
          .expect(201)
      ).body as Requisition;
      await ivan.submitRequisition(MEGA, requisition.id).expect(200);
      await hanna.approveRequisition(MEGA, requisition.id).expect(200);
      const order = (
        await buyer
          .createPurchaseOrder(MEGA, {
            requisitionId: requisition.id,
            supplierId: supplier.id,
            lines: [
              { catalogItemId: item.id, quantity: 1, unitPriceMinor: 140000 },
            ],
          })
          .expect(201)
      ).body as PurchaseOrder;
      expect(order.totalMinor).toBe(140000);

      for (const [actor, sees] of [
        [hanna, true],
        [ivan, true],
        [buyer, true],
        [gustav, true],
        [otherApprover, false],
      ] as const) {
        const ids = (
          (await actor.listPurchaseOrders(MEGA).expect(200))
            .body as PurchaseOrder[]
        ).map((o) => o.id);
        expect(ids.includes(order.id)).toBe(sees);
        await actor.getPurchaseOrder(MEGA, order.id).expect(sees ? 200 : 404);
      }
    });

    it('shows a buyer the approved requisitions, and not drafts or submitted ones', async () => {
      const alice = await as(PERSON.alice);
      const approved = await approvedRequisition(alice);
      const draft = (
        await alice
          .createRequisition(MAIN, {
            costCenterId: ops,
            justification: 'Draft',
            lines: [],
          })
          .expect(201)
      ).body as Requisition;
      const carol = await as(PERSON.carol);
      const visible = (await carol.listRequisitions(MAIN).expect(200))
        .body as Requisition[];
      expect(visible.map((r) => r.id)).toContain(approved.id);
      expect(visible.map((r) => r.id)).not.toContain(draft.id);
      expect(visible.every((r) => r.status === 'APPROVED')).toBe(true);
      expect(visible.find((r) => r.id === approved.id)!.actions).toEqual([]);
    });

    it('shows nothing to a person outside the company', async () => {
      const order = await orderOf();
      for (const person of [PERSON.mallory, PERSON.nomad, PERSON.oscar]) {
        const actor = await as(person);
        expect((await actor.listPurchaseOrders(MAIN).expect(200)).body).toEqual(
          [],
        );
        await actor.getPurchaseOrder(MAIN, order.id).expect(404);
      }
    });
  });

  describe('the database', () => {
    const carol: { personId: string; companyId: string } = {
      personId: PERSON.carol,
      companyId: MAIN,
    };

    it('refuses to change or delete an order or its lines, even for a buyer', async () => {
      const order = await orderOf();
      await expect(
        db.run(carol, (tx) =>
          tx.purchaseOrder.updateMany({
            data: { supplierId: SUPPLIER.mainTech },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        db.run(carol, (tx) => tx.purchaseOrder.deleteMany({})),
      ).rejects.toThrow();
      await expect(
        db.run(carol, (tx) =>
          tx.purchaseOrderLine.updateMany({ data: { quantity: 99 } }),
        ),
      ).rejects.toThrow();
      await expect(
        db.run(carol, (tx) => tx.purchaseOrderLine.deleteMany({})),
      ).rejects.toThrow();
      const again = await (
        await as(PERSON.carol)
      )
        .getPurchaseOrder(MAIN, order.id)
        .expect(200);
      expect(again.body).toEqual(order);
    });

    it('refuses lines added to an existing order in a later transaction', async () => {
      const order = await orderOf();
      await expect(
        db.run(carol, (tx) =>
          tx.purchaseOrderLine.createMany({
            data: [
              {
                companyId: MAIN,
                purchaseOrderId: order.id,
                position: 5,
                catalogItemId: CATALOG_ITEM.mainPaper,
                quantity: 1,
                unitPriceMinor: 1,
                amountMinor: 1,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('refuses an order for an inactive supplier or a requisition that is not approved, bypassing the service', async () => {
      const requisition = await approvedRequisition();
      const draft = (
        await (
          await as(PERSON.alice)
        )
          .createRequisition(MAIN, {
            costCenterId: ops,
            justification: 'x',
            lines: [],
          })
          .expect(201)
      ).body as Requisition;
      const dave = { personId: PERSON.dave, companyId: MAIN };
      const insert = (
        requisitionId: string,
        supplierId: string,
        scope = carol,
      ) =>
        db.run(scope, (tx) =>
          tx.purchaseOrder.createMany({
            data: [
              {
                companyId: MAIN,
                requisitionId,
                supplierId,
                createdByPersonId: scope.personId,
              },
            ],
          }),
        );
      await expect(
        insert(requisition.id, SUPPLIER.mainInactive),
      ).rejects.toThrow(/row-level security/);
      await expect(insert(draft.id, SUPPLIER.mainOffice, dave)).rejects.toThrow(
        /row-level security/,
      );
      const alice = { personId: PERSON.alice, companyId: MAIN };
      await expect(
        insert(requisition.id, SUPPLIER.mainOffice, alice),
      ).rejects.toThrow(/row-level security/);
      await expect(
        db.run(carol, (tx) =>
          tx.purchaseOrder.createMany({
            data: [
              {
                companyId: MAIN,
                requisitionId: requisition.id,
                supplierId: SUPPLIER.mainOffice,
                createdByPersonId: PERSON.dave,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
