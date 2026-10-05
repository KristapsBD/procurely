import type { INestApplication } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@prisma/client';
import type {
  AuditEntry,
  CostCenter,
  Member,
  Requisition,
} from '@procurely/shared-types';
import { CATALOG_ITEM, COMPANY, PERSON } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const MISSING = '11111111-1111-4111-8111-111111111111';
const EMPTY_DRAFT = { costCenterId: null, justification: '', lines: [] };

// Main company: alice requester, bob approver, carol buyer, dave admin. Alice is an approver in
// the SEK company. Each test makes the requisitions it needs.
describe('requisitions', () => {
  let app: INestApplication;
  let ops: string;
  let sekOps: string;
  beforeAll(async () => {
    app = await startApp();
    const opsOf = async (actor: Actor, companyId: string) =>
      (
        (await actor.listCostCenters(companyId).expect(200))
          .body as CostCenter[]
      ).find((c) => c.code === 'OPS')!.id;
    ops = await opsOf(await as(PERSON.alice), COMPANY.main);
    sekOps = await opsOf(await as(PERSON.erik), COMPANY.sek);
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  const completeDraft = () => ({
    costCenterId: ops,
    justification: 'Paper for the printers',
    lines: [{ catalogItemId: CATALOG_ITEM.mainPaper, quantity: 3 }],
  });

  async function draftOf(actor: Actor, body: object = completeDraft()) {
    const res = await actor.createRequisition(COMPANY.main, body).expect(201);
    return res.body as Requisition;
  }

  async function auditOf(entityId: string) {
    const log = (await (await as(PERSON.dave)).auditLog(COMPANY.main))
      .body as AuditEntry[];
    return log.filter((e) => e.entityId === entityId).reverse();
  }

  /** A second requester in the main company, invited by the admin. */
  async function otherRequester(email: string) {
    const invited = await (
      await as(PERSON.dave)
    )
      .inviteMember(COMPANY.main, { email, role: 'REQUESTER' })
      .expect(201);
    return as((invited.body as Member).personId);
  }

  describe('lifecycle', () => {
    it('saves an incomplete draft, edits it, submits it and cancels it, with an audit entry for each', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice, EMPTY_DRAFT);
      expect(draft).toEqual({
        id: expect.any(String),
        companyId: COMPANY.main,
        requesterPersonId: PERSON.alice,
        requesterName: 'Alice Requester',
        costCenterId: null,
        justification: '',
        status: 'DRAFT',
        approvalRoute: null,
        decisionNote: null,
        lines: [],
        totalMinor: 0,
        actions: ['edit', 'submit', 'cancel'],
      });

      const edited = await alice
        .updateRequisition(COMPANY.main, draft.id, {
          costCenterId: ops,
          justification: '  New laptop and paper  ',
          lines: [
            { catalogItemId: CATALOG_ITEM.mainPaper, quantity: 3 },
            { catalogItemId: CATALOG_ITEM.mainLaptop, quantity: 1 },
          ],
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        costCenterId: ops,
        justification: 'New laptop and paper',
        status: 'DRAFT',
        lines: [
          {
            catalogItemId: CATALOG_ITEM.mainPaper,
            catalogItemName: 'A4 copy paper, box of 5 reams',
            quantity: 3,
            unitPriceMinor: 2499,
            amountMinor: 7497,
          },
          {
            catalogItemId: CATALOG_ITEM.mainLaptop,
            catalogItemName: 'Laptop 14"',
            quantity: 1,
            unitPriceMinor: 119900,
            amountMinor: 119900,
          },
        ],
        totalMinor: 127397,
      });

      const submitted = await alice
        .submitRequisition(COMPANY.main, draft.id)
        .expect(200);
      expect(submitted.body).toMatchObject({
        status: 'SUBMITTED',
        totalMinor: 127397,
        actions: ['cancel'],
      });
      const cancelled = await alice
        .cancelRequisition(COMPANY.main, draft.id)
        .expect(200);
      expect(cancelled.body).toMatchObject({
        status: 'CANCELLED',
        actions: [],
      });
      expect(
        (await alice.getRequisition(COMPANY.main, draft.id).expect(200)).body,
      ).toEqual(cancelled.body);

      const entries = await auditOf(draft.id);
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['requisition.created', PERSON.alice],
        ['requisition.updated', PERSON.alice],
        ['requisition.submitted', PERSON.alice],
        ['requisition.cancelled', PERSON.alice],
      ]);
      expect(entries[0].details).toEqual(EMPTY_DRAFT);
      expect(entries[1].details).toEqual({
        costCenterId: ops,
        justification: 'New laptop and paper',
        lines: [
          {
            catalogItemId: CATALOG_ITEM.mainPaper,
            quantity: 3,
            unitPriceMinor: 2499,
            amountMinor: 7497,
          },
          {
            catalogItemId: CATALOG_ITEM.mainLaptop,
            quantity: 1,
            unitPriceMinor: 119900,
            amountMinor: 119900,
          },
        ],
      });
      expect(entries[2].details).toEqual({ from: 'DRAFT', to: 'SUBMITTED' });
      expect(entries[3].details).toEqual({
        from: 'SUBMITTED',
        to: 'CANCELLED',
      });
    });

    it('cancels a draft directly', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice);
      const res = await alice
        .cancelRequisition(COMPANY.main, draft.id)
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
    });

    it('keeps the unit price of the last save when the catalog price changes', async () => {
      const carol = await as(PERSON.carol);
      const pens = (
        await carol
          .createCatalogItem(COMPANY.main, {
            supplierId: (
              await carol.getCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper)
            ).body.supplierId,
            name: 'Requisition pens',
            unitPriceMinor: 150,
          })
          .expect(201)
      ).body.id as string;
      const alice = await as(PERSON.alice);
      const lines = [{ catalogItemId: pens, quantity: 4 }];
      const draft = await draftOf(alice, { ...completeDraft(), lines });
      expect(draft.lines[0]).toMatchObject({
        unitPriceMinor: 150,
        amountMinor: 600,
      });

      await carol
        .updateCatalogItem(COMPANY.main, pens, { unitPriceMinor: 175 })
        .expect(200);
      expect(
        (await alice.getRequisition(COMPANY.main, draft.id)).body.totalMinor,
      ).toBe(600);
      const resaved = await alice
        .updateRequisition(COMPANY.main, draft.id, {
          ...completeDraft(),
          lines,
        })
        .expect(200);
      expect(resaved.body.lines[0]).toMatchObject({
        unitPriceMinor: 175,
        amountMinor: 700,
      });
      await alice.cancelRequisition(COMPANY.main, draft.id).expect(200);
    });

    it('reports every amount as a whole number of minor units', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice, {
        ...completeDraft(),
        lines: [
          { catalogItemId: CATALOG_ITEM.mainPaper, quantity: 7 },
          { catalogItemId: CATALOG_ITEM.mainLaptop, quantity: 2 },
        ],
      });
      const amounts = [
        draft.totalMinor,
        ...draft.lines.flatMap((l) => [l.unitPriceMinor, l.amountMinor]),
      ];
      expect(amounts).toEqual([257293, 2499, 17493, 119900, 239800]);
      expect(amounts.every(Number.isInteger)).toBe(true);
    });
  });

  describe('illegal transitions', () => {
    it('refuses to submit a draft without a cost center, a justification or a line', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice, {
        ...EMPTY_DRAFT,
        justification: '   ',
      });
      const res = await alice
        .submitRequisition(COMPANY.main, draft.id)
        .expect(409);
      expect(res.body.message).toBe(
        'Cannot submit without a cost center, a justification, at least one line',
      );
      for (const missing of [
        { costCenterId: null },
        { justification: ' ' },
        { lines: [] },
      ]) {
        await alice
          .updateRequisition(COMPANY.main, draft.id, {
            ...completeDraft(),
            ...missing,
          })
          .expect(200);
        await alice.submitRequisition(COMPANY.main, draft.id).expect(409);
      }
      expect(
        (await alice.getRequisition(COMPANY.main, draft.id)).body.status,
      ).toBe('DRAFT');
    });

    it('refuses to edit or resubmit a submitted requisition, which keeps its lines', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice);
      await alice.submitRequisition(COMPANY.main, draft.id).expect(200);
      const edit = await alice
        .updateRequisition(COMPANY.main, draft.id, EMPTY_DRAFT)
        .expect(409);
      expect(edit.body.message).toBe(
        'A submitted requisition cannot be edited',
      );
      await alice.submitRequisition(COMPANY.main, draft.id).expect(409);
      const after = (await alice.getRequisition(COMPANY.main, draft.id))
        .body as Requisition;
      expect(after).toMatchObject({
        status: 'SUBMITTED',
        justification: 'Paper for the printers',
        totalMinor: 7497,
      });
    });

    it('treats cancelled as final', async () => {
      const alice = await as(PERSON.alice);
      const draft = await draftOf(alice);
      await alice.cancelRequisition(COMPANY.main, draft.id).expect(200);
      await alice
        .updateRequisition(COMPANY.main, draft.id, completeDraft())
        .expect(409);
      await alice.submitRequisition(COMPANY.main, draft.id).expect(409);
      const again = await alice
        .cancelRequisition(COMPANY.main, draft.id)
        .expect(409);
      expect(again.body.message).toBe(
        'A cancelled requisition cannot be cancelled',
      );
      expect((await auditOf(draft.id)).map((e) => e.action)).toEqual([
        'requisition.created',
        'requisition.cancelled',
      ]);
    });
  });

  describe('validation', () => {
    it('rejects malformed bodies', async () => {
      const alice = await as(PERSON.alice);
      const line = { catalogItemId: CATALOG_ITEM.mainPaper, quantity: 1 };
      for (const body of [
        {},
        { ...completeDraft(), costCenterId: undefined },
        { ...completeDraft(), costCenterId: 'not-a-uuid' },
        { ...completeDraft(), justification: 5 },
        { ...completeDraft(), lines: 'paper' },
        { ...completeDraft(), lines: [null] },
        { ...completeDraft(), lines: [{ ...line, catalogItemId: 'x' }] },
        { ...completeDraft(), lines: [{ ...line, quantity: 0 }] },
        { ...completeDraft(), lines: [{ ...line, quantity: -1 }] },
        { ...completeDraft(), lines: [{ ...line, quantity: 1.5 }] },
        { ...completeDraft(), lines: [{ ...line, quantity: '2' }] },
      ]) {
        await alice.createRequisition(COMPANY.main, body).expect(400);
      }
    });

    it('rejects another company’s cost center or catalog item, and unknown ones', async () => {
      const alice = await as(PERSON.alice);
      for (const costCenterId of [sekOps, MISSING]) {
        await alice
          .createRequisition(COMPANY.main, { ...completeDraft(), costCenterId })
          .expect(400);
      }
      for (const catalogItemId of [CATALOG_ITEM.sekPaper, MISSING]) {
        await alice
          .createRequisition(COMPANY.main, {
            ...completeDraft(),
            lines: [{ catalogItemId, quantity: 1 }],
          })
          .expect(400);
      }
      const draft = await draftOf(alice);
      await alice
        .updateRequisition(COMPANY.main, draft.id, {
          ...completeDraft(),
          costCenterId: sekOps,
        })
        .expect(400);
      expect(
        (await alice.getRequisition(COMPANY.main, draft.id)).body.costCenterId,
      ).toBe(ops);
    });

    it('refuses an item of an inactive supplier and an amount too large to store', async () => {
      const alice = await as(PERSON.alice);
      await alice
        .createRequisition(COMPANY.main, {
          ...completeDraft(),
          lines: [{ catalogItemId: CATALOG_ITEM.mainOldPaper, quantity: 1 }],
        })
        .expect(409);
      const res = await alice
        .createRequisition(COMPANY.main, {
          ...completeDraft(),
          lines: [{ catalogItemId: CATALOG_ITEM.mainLaptop, quantity: 20000 }],
        })
        .expect(400);
      expect(res.body.message).toBe('The amount for Laptop 14" is too large');
    });
  });

  describe('visibility', () => {
    it('shows a requester only their own requisitions, and lets them change only those', async () => {
      const alice = await as(PERSON.alice);
      const mine = await draftOf(alice);
      const rita = await otherRequester('rita.requester@procurely.test');
      const ritas = await draftOf(rita);

      const ritaList = (await rita.listRequisitions(COMPANY.main).expect(200))
        .body as Requisition[];
      expect(ritaList.map((r) => r.id)).toEqual([ritas.id]);
      const aliceIds = (
        (await alice.listRequisitions(COMPANY.main).expect(200))
          .body as Requisition[]
      ).map((r) => r.id);
      expect(aliceIds).toContain(mine.id);
      expect(aliceIds).not.toContain(ritas.id);

      await rita.getRequisition(COMPANY.main, mine.id).expect(404);
      await rita
        .updateRequisition(COMPANY.main, mine.id, EMPTY_DRAFT)
        .expect(404);
      await rita.submitRequisition(COMPANY.main, mine.id).expect(404);
      await rita.cancelRequisition(COMPANY.main, mine.id).expect(404);
      expect(
        (await alice.getRequisition(COMPANY.main, mine.id)).body,
      ).toMatchObject({ status: 'DRAFT', totalMinor: 7497 });
    });

    it('lets an admin read every requisition of the company but change only their own', async () => {
      const alice = await as(PERSON.alice);
      const alices = await draftOf(alice);
      const dave = await as(PERSON.dave);

      const list = (await dave.listRequisitions(COMPANY.main).expect(200))
        .body as Requisition[];
      expect(list.find((r) => r.id === alices.id)).toMatchObject({
        requesterPersonId: PERSON.alice,
        requesterName: 'Alice Requester',
        actions: [],
      });
      const read = await dave
        .getRequisition(COMPANY.main, alices.id)
        .expect(200);
      expect(read.body).toMatchObject({ totalMinor: 7497, actions: [] });

      for (const refused of [
        () => dave.updateRequisition(COMPANY.main, alices.id, EMPTY_DRAFT),
        () => dave.submitRequisition(COMPANY.main, alices.id),
        () => dave.cancelRequisition(COMPANY.main, alices.id),
      ]) {
        const res = await refused().expect(403);
        expect(res.body.message).toBe(
          'Only the requester may change a requisition',
        );
      }
      expect(
        (await alice.getRequisition(COMPANY.main, alices.id)).body,
      ).toMatchObject({
        status: 'DRAFT',
        justification: 'Paper for the printers',
      });

      const own = await draftOf(dave);
      expect(own).toMatchObject({
        requesterPersonId: PERSON.dave,
        actions: ['edit', 'submit', 'cancel'],
      });
      await dave.submitRequisition(COMPANY.main, own.id).expect(200);
      await dave.cancelRequisition(COMPANY.main, own.id).expect(200);
      await alice.getRequisition(COMPANY.main, own.id).expect(404);
    });

    it('shows buyers and approvers nothing and lets them raise nothing', async () => {
      const alices = await draftOf(await as(PERSON.alice));
      for (const person of [PERSON.carol, PERSON.bob]) {
        const actor = await as(person);
        expect(
          (await actor.listRequisitions(COMPANY.main).expect(200)).body,
        ).toEqual([]);
        await actor.getRequisition(COMPANY.main, alices.id).expect(404);
        await actor
          .createRequisition(COMPANY.main, completeDraft())
          .expect(403);
        await actor.submitRequisition(COMPANY.main, alices.id).expect(403);
        await actor.cancelRequisition(COMPANY.main, alices.id).expect(403);
      }
    });

    it('shows a two-company person only the requisitions of the company they act in', async () => {
      const alice = await as(PERSON.alice);
      const mine = await draftOf(alice);
      // Alice is an approver in the SEK company.
      expect(
        (await alice.listRequisitions(COMPANY.sek).expect(200)).body,
      ).toEqual([]);
      await alice.getRequisition(COMPANY.sek, mine.id).expect(404);
      await alice.cancelRequisition(COMPANY.sek, mine.id).expect(403);
      expect(
        (await alice.getRequisition(COMPANY.main, mine.id)).body.status,
      ).toBe('DRAFT');
    });

    it('shows another company’s admin, the attacker, deactivated members and people without a company nothing', async () => {
      const alices = await draftOf(await as(PERSON.alice));
      for (const person of [
        PERSON.erik,
        PERSON.mallory,
        PERSON.oscar,
        PERSON.nomad,
      ]) {
        const actor = await as(person);
        expect(
          (await actor.listRequisitions(COMPANY.main).expect(200)).body,
        ).toEqual([]);
        await actor.getRequisition(COMPANY.main, alices.id).expect(404);
        await actor.createRequisition(COMPANY.main, EMPTY_DRAFT).expect(403);
        await actor.cancelRequisition(COMPANY.main, alices.id).expect(404);
      }
      const erik = await as(PERSON.erik);
      await erik.getRequisition(COMPANY.sek, alices.id).expect(404);
      await erik.cancelRequisition(COMPANY.sek, alices.id).expect(404);
    });

    describe('in the database itself, as the API role without the API', () => {
      const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
      afterAll(() => db.$disconnect());

      function actingAs<T>(
        personId: string,
        work: (tx: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> {
        return db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT
            set_config('app.current_user_id', ${personId}, true),
            set_config('app.current_company_id', ${COMPANY.main}, true)`;
          return work(tx);
        });
      }
      const count = (tx: Prisma.TransactionClient, table: string) =>
        tx
          .$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM ${table}`,
          )
          .then((rows) => rows[0].n);

      it('hides every requisition and line from buyers and approvers', async () => {
        await draftOf(await as(PERSON.alice));
        for (const person of [PERSON.carol, PERSON.bob]) {
          await actingAs(person, async (tx) => {
            expect(await count(tx, 'requisitions')).toBe(0);
            expect(await count(tx, 'requisition_lines')).toBe(0);
          });
        }
        await actingAs(PERSON.dave, async (tx) => {
          expect(await count(tx, 'requisition_lines')).toBeGreaterThan(0);
        });
      });

      it('refuses an admin’s update of someone else’s requisition', async () => {
        const alices = await draftOf(await as(PERSON.alice));
        const changed = await actingAs(
          PERSON.dave,
          (tx) =>
            tx.$executeRaw`UPDATE requisitions SET status = 'CANCELLED'
              WHERE id = ${alices.id}::uuid`,
        );
        expect(changed).toBe(0);
      });

      it('freezes the lines of a submitted requisition and checks every amount', async () => {
        const alice = await as(PERSON.alice);
        const draft = await draftOf(alice);
        const addLine = (amount: number) =>
          actingAs(
            PERSON.alice,
            (tx) =>
              tx.$executeRaw`INSERT INTO requisition_lines
                (company_id, requisition_id, position, catalog_item_id, quantity,
                 unit_price_minor, amount_minor)
                VALUES (${COMPANY.main}::uuid, ${draft.id}::uuid, 9,
                        ${CATALOG_ITEM.mainPaper}::uuid, 2, 2499, ${amount})`,
          );
        await expect(addLine(4999)).rejects.toThrow(
          /requisition_lines_amount_minor_check/,
        );
        await alice.submitRequisition(COMPANY.main, draft.id).expect(200);
        await expect(addLine(4998)).rejects.toThrow(/row-level security/);
      });
    });

    it('ignores a requester or company smuggled into the body', async () => {
      const alice = await as(PERSON.alice);
      const res = await alice
        .createRequisition(COMPANY.main, {
          ...completeDraft(),
          requesterPersonId: PERSON.dave,
          companyId: COMPANY.sek,
          status: 'SUBMITTED',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        requesterPersonId: PERSON.alice,
        companyId: COMPANY.main,
        status: 'DRAFT',
      });
    });
  });
});
