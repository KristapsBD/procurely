import type { INestApplication } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@prisma/client';
import type {
  ApprovalRule,
  AuditEntry,
  CatalogItem,
  CostCenter,
  Requisition,
} from '@procurely/shared-types';
import {
  CATALOG_ITEM,
  COMPANY,
  PERSON,
  approvalRules,
} from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const MEGA = COMPANY.large;
const SEEDED_RULES = approvalRules
  .filter((r) => r.companyId === MEGA)
  .map(({ thresholdMinor, requiredRole }) => ({
    thresholdMinor,
    requiredRole,
  }));

// Megacorp: gustav admin, hanna approver, ivan requester. Its rules change from test to test; a
// catalog item priced at one cent makes a requisition's quantity its exact total. Acme (main:
// alice requester, bob approver, carol buyer, dave admin) keeps no rules, as the seed has it.
describe('approvals', () => {
  let app: INestApplication;
  let cent: string;
  let plant: string;
  let acmeOps: string;
  beforeAll(async () => {
    app = await startApp();
    const gustav = await as(PERSON.gustav);
    const supplier = await gustav
      .createSupplier(MEGA, { name: 'Penny Parts' })
      .expect(201);
    cent = (
      (
        await gustav
          .createCatalogItem(MEGA, {
            supplierId: supplier.body.id,
            name: 'One cent part',
            unitPriceMinor: 1,
          })
          .expect(201)
      ).body as CatalogItem
    ).id;
    const codeOf = async (actor: Actor, companyId: string, code: string) =>
      (
        (await actor.listCostCenters(companyId).expect(200))
          .body as CostCenter[]
      ).find((c) => c.code === code)!.id;
    plant = await codeOf(gustav, MEGA, 'PLANT1');
    acmeOps = await codeOf(await as(PERSON.alice), COMPANY.main, 'OPS');
  });
  afterAll(async () => {
    await setRules(SEEDED_RULES);
    await app.close();
  });
  const as = (personId: string) => Actor.signIn(app, personId);

  async function setRules(rules: object[]) {
    const gustav = await as(PERSON.gustav);
    const existing = (await gustav.listApprovalRules(MEGA).expect(200))
      .body as ApprovalRule[];
    for (const r of existing) {
      await gustav.deleteApprovalRule(MEGA, r.id).expect(204);
    }
    for (const r of rules) {
      await gustav.createApprovalRule(MEGA, r).expect(201);
    }
  }

  /** A complete draft of exactly `totalMinor`, made and submitted by `personId`. */
  async function submitted(totalMinor: number, personId: string = PERSON.ivan) {
    const actor = await as(personId);
    const draft = await actor
      .createRequisition(MEGA, {
        costCenterId: plant,
        justification: `Parts for ${totalMinor}`,
        lines: [{ catalogItemId: cent, quantity: totalMinor }],
      })
      .expect(201);
    const res = await actor
      .submitRequisition(MEGA, (draft.body as Requisition).id)
      .expect(200);
    return res.body as Requisition;
  }

  async function aliceSubmitsInAcme() {
    const alice = await as(PERSON.alice);
    const draft = await alice
      .createRequisition(COMPANY.main, {
        costCenterId: acmeOps,
        justification: 'Paper for the printers',
        lines: [{ catalogItemId: CATALOG_ITEM.mainPaper, quantity: 3 }],
      })
      .expect(201);
    const res = await alice
      .submitRequisition(COMPANY.main, (draft.body as Requisition).id)
      .expect(200);
    return res.body as Requisition;
  }

  async function auditOf(companyId: string, admin: string, entityId: string) {
    const log = (await (await as(admin)).auditLog(companyId).expect(200))
      .body as AuditEntry[];
    return log.filter((e) => e.entityId === entityId).reverse();
  }

  const idsIn = async (actor: Actor, companyId: string) =>
    (
      (await actor.listRequisitions(companyId).expect(200))
        .body as Requisition[]
    ).map((r) => r.id);

  describe('rules', () => {
    beforeEach(() => setRules([]));

    it('lets an admin add and delete rules, lowest threshold first, with an audit entry for each', async () => {
      const gustav = await as(PERSON.gustav);
      const admin = (
        await gustav
          .createApprovalRule(MEGA, {
            thresholdMinor: 200000,
            requiredRole: 'ADMIN',
          })
          .expect(201)
      ).body as ApprovalRule;
      expect(admin).toEqual({
        id: expect.any(String),
        companyId: MEGA,
        thresholdMinor: 200000,
        requiredRole: 'ADMIN',
      });
      await gustav
        .createApprovalRule(MEGA, {
          thresholdMinor: 50000,
          requiredRole: 'APPROVER',
        })
        .expect(201);
      const listed = (await gustav.listApprovalRules(MEGA).expect(200))
        .body as ApprovalRule[];
      expect(listed.map((r) => [r.thresholdMinor, r.requiredRole])).toEqual([
        [50000, 'APPROVER'],
        [200000, 'ADMIN'],
      ]);

      await gustav.deleteApprovalRule(MEGA, admin.id).expect(204);
      await gustav.deleteApprovalRule(MEGA, admin.id).expect(404);
      expect(
        ((await gustav.listApprovalRules(MEGA)).body as ApprovalRule[]).map(
          (r) => r.thresholdMinor,
        ),
      ).toEqual([50000]);
      const entries = await auditOf(MEGA, PERSON.gustav, admin.id);
      expect(
        entries.map((e) => [e.action, e.actorPersonId, e.details]),
      ).toEqual([
        [
          'approval_rule.created',
          PERSON.gustav,
          { thresholdMinor: 200000, requiredRole: 'ADMIN' },
        ],
        [
          'approval_rule.deleted',
          PERSON.gustav,
          { thresholdMinor: 200000, requiredRole: 'ADMIN' },
        ],
      ]);
    });

    it('refuses a second rule at the same threshold and any role but approver or admin', async () => {
      const gustav = await as(PERSON.gustav);
      const rule = { thresholdMinor: 50000, requiredRole: 'APPROVER' };
      await gustav.createApprovalRule(MEGA, rule).expect(201);
      await gustav
        .createApprovalRule(MEGA, { ...rule, requiredRole: 'ADMIN' })
        .expect(409);
      for (const body of [
        { ...rule, requiredRole: 'REQUESTER' },
        { ...rule, requiredRole: 'BUYER' },
        { thresholdMinor: 1 },
        { ...rule, thresholdMinor: -1 },
        { ...rule, thresholdMinor: 1.5 },
        { ...rule, thresholdMinor: '500' },
      ]) {
        await gustav.createApprovalRule(MEGA, body).expect(400);
      }
      expect((await gustav.listApprovalRules(MEGA)).body).toHaveLength(1);
    });

    it('lets members read the rules but only admins change them', async () => {
      await setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]);
      const [rule] = (await (await as(PERSON.gustav)).listApprovalRules(MEGA))
        .body as ApprovalRule[];
      for (const person of [PERSON.hanna, PERSON.ivan]) {
        const actor = await as(person);
        expect((await actor.listApprovalRules(MEGA).expect(200)).body).toEqual([
          rule,
        ]);
        await actor
          .createApprovalRule(MEGA, {
            thresholdMinor: 1,
            requiredRole: 'APPROVER',
          })
          .expect(403);
        await actor.deleteApprovalRule(MEGA, rule.id).expect(403);
      }
    });

    it('keeps every company’s rules to itself, from other admins and the attacker', async () => {
      await setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]);
      const [rule] = (await (await as(PERSON.gustav)).listApprovalRules(MEGA))
        .body as ApprovalRule[];
      for (const person of [PERSON.dave, PERSON.erik, PERSON.mallory]) {
        const actor = await as(person);
        for (const company of [
          COMPANY.main,
          COMPANY.sek,
          COMPANY.large,
          COMPANY.empty,
        ]) {
          const rules = (await actor.listApprovalRules(company).expect(200))
            .body as ApprovalRule[];
          expect(rules.map((r) => r.id)).not.toContain(rule.id);
          expect(rules.every((r) => r.companyId === company)).toBe(true);
          // A non-admin member of the company acted in learns only that their role may not.
          await actor
            .deleteApprovalRule(company, rule.id)
            .expect(
              person === PERSON.mallory && company === COMPANY.empty
                ? 403
                : 404,
            );
        }
        await actor
          .createApprovalRule(MEGA, {
            thresholdMinor: 1,
            requiredRole: 'ADMIN',
          })
          .expect(403);
      }
      expect(
        (await (await as(PERSON.dave)).listApprovalRules(COMPANY.main)).body,
      ).toEqual([]);
      expect(
        (await (await as(PERSON.gustav)).listApprovalRules(MEGA)).body,
      ).toEqual([rule]);
    });
  });

  describe('which rule applies', () => {
    it('treats the threshold as inclusive: just below is approved at once, at and above need an approver', async () => {
      await setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]);
      const below = await submitted(49999);
      expect(below).toMatchObject({
        status: 'APPROVED',
        approvalRoute: 'UNDER_THRESHOLD',
        decisionNote:
          "Approved automatically: the total of 499.99 EUR is under the company's lowest approval threshold of 500.00 EUR.",
        actions: [],
      });
      for (const total of [50000, 50001]) {
        expect(await submitted(total)).toMatchObject({
          status: 'SUBMITTED',
          approvalRoute: 'APPROVER',
          decisionNote: null,
          actions: ['cancel'],
        });
      }
      const entries = await auditOf(MEGA, PERSON.gustav, below.id);
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['requisition.created', PERSON.ivan],
        ['requisition.submitted', PERSON.ivan],
        ['requisition.auto_approved', PERSON.ivan],
      ]);
      expect(entries[1].details).toEqual({ from: 'DRAFT', to: 'APPROVED' });
      expect(entries[2].details).toEqual({
        totalMinor: 49999,
        note: below.decisionNote,
      });
    });

    it('lets the greatest threshold reached decide alone, in one step', async () => {
      await setRules([
        { thresholdMinor: 50000, requiredRole: 'APPROVER' },
        { thresholdMinor: 200000, requiredRole: 'ADMIN' },
      ]);
      const approverOne = await submitted(199999);
      const adminOne = await submitted(200000);
      const above = await submitted(200001);
      expect(approverOne.approvalRoute).toBe('APPROVER');
      expect(adminOne.approvalRoute).toBe('ADMIN');
      expect(above.approvalRoute).toBe('ADMIN');

      const hanna = await as(PERSON.hanna);
      const inbox = await idsIn(hanna, MEGA);
      expect(inbox).toContain(approverOne.id);
      expect(inbox).not.toContain(adminOne.id);
      await hanna.approveRequisition(MEGA, adminOne.id).expect(404);

      const gustav = await as(PERSON.gustav);
      const decided = await gustav
        .approveRequisition(MEGA, adminOne.id, { comment: 'Budget agreed' })
        .expect(200);
      expect(decided.body).toMatchObject({
        status: 'APPROVED',
        approvalRoute: 'ADMIN',
        decisionNote: 'Budget agreed',
        actions: [],
      });
      const entries = await auditOf(MEGA, PERSON.gustav, adminOne.id);
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['requisition.created', PERSON.ivan],
        ['requisition.submitted', PERSON.ivan],
        ['requisition.approved', PERSON.gustav],
      ]);
    });

    it('lets an admin decide one routed to approvers, too', async () => {
      await setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]);
      const req = await submitted(60000);
      const gustav = await as(PERSON.gustav);
      expect(
        (await gustav.getRequisition(MEGA, req.id).expect(200)).body.actions,
      ).toEqual(['approve', 'reject']);
      await gustav
        .rejectRequisition(MEGA, req.id, { reason: 'Use stock parts' })
        .expect(200);
      expect(
        (await (await as(PERSON.ivan)).getRequisition(MEGA, req.id)).body,
      ).toMatchObject({ status: 'REJECTED', decisionNote: 'Use stock parts' });
    });

    it('keeps the route a requisition got on submit when the rules change', async () => {
      await setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]);
      const req = await submitted(60000);
      await setRules([{ thresholdMinor: 50000, requiredRole: 'ADMIN' }]);
      const hanna = await as(PERSON.hanna);
      expect(await idsIn(hanna, MEGA)).toContain(req.id);
      await hanna.approveRequisition(MEGA, req.id).expect(200);
    });
  });

  describe('a company without rules', () => {
    it('leaves a submitted requisition to an admin, not an approver or a buyer', async () => {
      const req = await aliceSubmitsInAcme();
      expect(req).toMatchObject({
        status: 'SUBMITTED',
        approvalRoute: 'NO_RULES',
        decisionNote: null,
        actions: ['cancel'],
      });
      const bob = await as(PERSON.bob);
      expect(await idsIn(bob, COMPANY.main)).not.toContain(req.id);
      await bob.getRequisition(COMPANY.main, req.id).expect(404);
      await bob.approveRequisition(COMPANY.main, req.id).expect(404);
      const carol = await as(PERSON.carol);
      await carol.approveRequisition(COMPANY.main, req.id).expect(403);
      await carol
        .rejectRequisition(COMPANY.main, req.id, { reason: 'No' })
        .expect(403);

      const dave = await as(PERSON.dave);
      expect(
        (await dave.getRequisition(COMPANY.main, req.id).expect(200)).body
          .actions,
      ).toEqual(['approve', 'reject']);
      const approved = await dave
        .approveRequisition(COMPANY.main, req.id, { comment: '   ' })
        .expect(200);
      expect(approved.body).toMatchObject({
        status: 'APPROVED',
        approvalRoute: 'NO_RULES',
        decisionNote: null,
      });
      const alice = await as(PERSON.alice);
      expect(
        (await alice.getRequisition(COMPANY.main, req.id)).body,
      ).toMatchObject({ status: 'APPROVED', decisionNote: null, actions: [] });
    });

    it('shows the requester the rejection reason, with an audit entry for the decision', async () => {
      const req = await aliceSubmitsInAcme();
      const dave = await as(PERSON.dave);
      await dave
        .rejectRequisition(COMPANY.main, req.id, {
          reason: '  Order from the framework supplier  ',
        })
        .expect(200);
      const seen = (
        await (
          await as(PERSON.alice)
        )
          .getRequisition(COMPANY.main, req.id)
          .expect(200)
      ).body as Requisition;
      expect(seen).toMatchObject({
        status: 'REJECTED',
        decisionNote: 'Order from the framework supplier',
        actions: [],
      });
      const entries = await auditOf(COMPANY.main, PERSON.dave, req.id);
      expect(entries.at(-1)).toMatchObject({
        action: 'requisition.rejected',
        actorPersonId: PERSON.dave,
        details: {
          from: 'SUBMITTED',
          to: 'REJECTED',
          approvalRoute: 'NO_RULES',
          note: 'Order from the framework supplier',
        },
      });
    });
  });

  describe('refusals', () => {
    beforeAll(() =>
      setRules([{ thresholdMinor: 50000, requiredRole: 'APPROVER' }]),
    );

    it('refuses self-approval to an admin and a requester, and changes nothing', async () => {
      const own = await submitted(60000, PERSON.gustav);
      const gustav = await as(PERSON.gustav);
      expect(own.actions).toEqual(['cancel']);
      for (const attempt of [
        () => gustav.approveRequisition(MEGA, own.id),
        () => gustav.rejectRequisition(MEGA, own.id, { reason: 'Mine' }),
      ]) {
        const res = await attempt().expect(403);
        expect(res.body.message).toBe(
          'You cannot approve or reject your own requisition',
        );
      }
      const ivans = await submitted(60000);
      const ivan = await as(PERSON.ivan);
      const res = await ivan.approveRequisition(MEGA, ivans.id).expect(403);
      expect(res.body.message).toBe(
        'You cannot approve or reject your own requisition',
      );
      for (const id of [own.id, ivans.id]) {
        expect((await gustav.getRequisition(MEGA, id)).body.status).toBe(
          'SUBMITTED',
        );
        expect(
          (await auditOf(MEGA, PERSON.gustav, id)).map((e) => e.action),
        ).toEqual(['requisition.created', 'requisition.submitted']);
      }
    });

    it('refuses a rejection without a reason with 400, and changes nothing', async () => {
      const req = await submitted(60000);
      const hanna = await as(PERSON.hanna);
      for (const body of [{}, { reason: '   ' }, { reason: 5 }]) {
        await hanna.rejectRequisition(MEGA, req.id, body).expect(400);
      }
      await hanna.approveRequisition(MEGA, req.id, { comment: 5 }).expect(400);
      expect((await hanna.getRequisition(MEGA, req.id)).body).toMatchObject({
        status: 'SUBMITTED',
        decisionNote: null,
      });
      expect(
        (await auditOf(MEGA, PERSON.gustav, req.id)).map((e) => e.action),
      ).toEqual(['requisition.created', 'requisition.submitted']);
    });

    it('treats approved and rejected as final, and decides only submitted requisitions', async () => {
      const hanna = await as(PERSON.hanna);
      const ivan = await as(PERSON.ivan);
      const approved = await submitted(60000);
      await hanna.approveRequisition(MEGA, approved.id).expect(200);
      const again = await hanna
        .rejectRequisition(MEGA, approved.id, { reason: 'Changed my mind' })
        .expect(409);
      expect(again.body.message).toBe(
        'A approved requisition cannot be rejected',
      );
      await ivan.cancelRequisition(MEGA, approved.id).expect(409);

      const rejected = await submitted(60000);
      await hanna
        .rejectRequisition(MEGA, rejected.id, { reason: 'Too many' })
        .expect(200);
      await hanna.approveRequisition(MEGA, rejected.id).expect(409);
      await ivan.cancelRequisition(MEGA, rejected.id).expect(409);

      const draft = (
        await ivan
          .createRequisition(MEGA, {
            costCenterId: plant,
            justification: 'Not yet',
            lines: [{ catalogItemId: cent, quantity: 60000 }],
          })
          .expect(201)
      ).body as Requisition;
      const gustav = await as(PERSON.gustav);
      const early = await gustav.approveRequisition(MEGA, draft.id).expect(409);
      expect(early.body.message).toBe('A draft requisition cannot be approved');
      await gustav
        .updateRequisition(MEGA, draft.id, {
          costCenterId: plant,
          justification: 'Edited by the admin',
          lines: [],
        })
        .expect(403);
    });

    it('lets the requester still cancel a submitted requisition', async () => {
      const req = await submitted(60000);
      await (await as(PERSON.ivan)).cancelRequisition(MEGA, req.id).expect(200);
      await (
        await as(PERSON.hanna)
      )
        .approveRequisition(MEGA, req.id)
        .expect(404);
    });
  });

  describe('the approver inbox', () => {
    beforeAll(() =>
      setRules([
        { thresholdMinor: 50000, requiredRole: 'APPROVER' },
        { thresholdMinor: 200000, requiredRole: 'ADMIN' },
      ]),
    );

    it('holds the submitted requisitions an approver may decide, and those they decided', async () => {
      const mine = await submitted(60000);
      const theAdmins = await submitted(250000);
      const decided = await submitted(70000);
      const auto = await submitted(100);
      const ivan = await as(PERSON.ivan);
      const draft = (
        await ivan
          .createRequisition(MEGA, {
            costCenterId: plant,
            justification: 'Draft parts',
            lines: [{ catalogItemId: cent, quantity: 60000 }],
          })
          .expect(201)
      ).body as Requisition;
      const hanna = await as(PERSON.hanna);
      const approved = await hanna
        .approveRequisition(MEGA, decided.id, { comment: 'Fine' })
        .expect(200);
      expect(approved.body).toMatchObject({
        status: 'APPROVED',
        decisionNote: 'Fine',
        requesterName: 'Ivan Requester',
        actions: [],
      });

      const rows = (await hanna.listRequisitions(MEGA).expect(200))
        .body as Requisition[];
      const ids = rows.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([mine.id, decided.id]));
      for (const hidden of [theAdmins.id, auto.id, draft.id]) {
        expect(ids).not.toContain(hidden);
        await hanna.getRequisition(MEGA, hidden).expect(404);
      }
      expect(rows.every((r) => r.companyId === MEGA)).toBe(true);
      expect(
        rows.every(
          (r) => r.status !== 'SUBMITTED' || r.approvalRoute === 'APPROVER',
        ),
      ).toBe(true);
      expect(rows.find((r) => r.id === mine.id)).toMatchObject({
        requesterName: 'Ivan Requester',
        totalMinor: 60000,
        lines: [expect.objectContaining({ quantity: 60000 })],
        actions: ['approve', 'reject'],
      });
    });

    it('shows nothing of one company’s inbox to approvers elsewhere, other admins or the attacker', async () => {
      const req = await submitted(60000);
      const acme = await aliceSubmitsInAcme();
      for (const person of [
        PERSON.bob,
        PERSON.alice,
        PERSON.dave,
        PERSON.erik,
        PERSON.mallory,
      ]) {
        const actor = await as(person);
        for (const company of [
          COMPANY.main,
          COMPANY.sek,
          COMPANY.large,
          COMPANY.empty,
        ]) {
          expect(await idsIn(actor, company)).not.toContain(req.id);
          await actor.getRequisition(company, req.id).expect(404);
        }
        expect(
          [403, 404].includes(
            (await actor.approveRequisition(MEGA, req.id)).status,
          ),
        ).toBe(true);
      }
      const hanna = await as(PERSON.hanna);
      for (const company of [COMPANY.main, COMPANY.sek, COMPANY.empty]) {
        expect(await idsIn(hanna, company)).toEqual([]);
        await hanna.approveRequisition(company, acme.id).expect(404);
      }
      await hanna.approveRequisition(MEGA, acme.id).expect(404);
      expect(
        (await (await as(PERSON.dave)).getRequisition(COMPANY.main, acme.id))
          .body.status,
      ).toBe('SUBMITTED');
      expect(
        (await (await as(PERSON.gustav)).getRequisition(MEGA, req.id)).body
          .status,
      ).toBe('SUBMITTED');
    });
  });

  describe('in the database itself, as the API role without the API', () => {
    const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    afterAll(() => db.$disconnect());
    beforeAll(() =>
      setRules([
        { thresholdMinor: 50000, requiredRole: 'APPROVER' },
        { thresholdMinor: 200000, requiredRole: 'ADMIN' },
      ]),
    );

    function actingAs<T>(
      personId: string,
      work: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT
          set_config('app.current_user_id', ${personId}, true),
          set_config('app.current_company_id', ${MEGA}, true)`;
        return work(tx);
      });
    }
    const decide = (personId: string, id: string) =>
      actingAs(personId, async (tx) => {
        await tx.$executeRaw`INSERT INTO requisition_decisions
          (company_id, requisition_id, actor_person_id, outcome)
          VALUES (${MEGA}::uuid, ${id}::uuid, ${personId}::uuid, 'APPROVED')`;
        return tx.$executeRaw`UPDATE requisitions SET status = 'APPROVED'
          WHERE id = ${id}::uuid`;
      });

    it('refuses an approver’s decision above their authority, and a requester’s own', async () => {
      const adminOne = await submitted(250000);
      await expect(decide(PERSON.hanna, adminOne.id)).rejects.toThrow(
        /row-level security/,
      );
      const approverOne = await submitted(60000);
      await expect(decide(PERSON.ivan, approverOne.id)).rejects.toThrow(
        /row-level security/,
      );
      const plainUpdate = await actingAs(
        PERSON.ivan,
        (tx) =>
          tx.$executeRaw`UPDATE requisitions SET status = 'APPROVED'
            WHERE id = ${approverOne.id}::uuid`,
      ).catch((e: unknown) => String(e));
      expect(String(plainUpdate)).toMatch(/decision row/);
      expect(
        (await (await as(PERSON.gustav)).getRequisition(MEGA, approverOne.id))
          .body.status,
      ).toBe('SUBMITTED');
    });

    it('refuses a submit whose route does not match the rules, and an approver editing the requisition', async () => {
      const ivan = await as(PERSON.ivan);
      const draft = (
        await ivan
          .createRequisition(MEGA, {
            costCenterId: plant,
            justification: 'Big order',
            lines: [{ catalogItemId: cent, quantity: 250000 }],
          })
          .expect(201)
      ).body as Requisition;
      await expect(
        actingAs(
          PERSON.ivan,
          (tx) =>
            tx.$executeRaw`UPDATE requisitions
              SET status = 'SUBMITTED', approval_route = 'APPROVER'
              WHERE id = ${draft.id}::uuid`,
        ),
      ).rejects.toThrow(/does not match/);
      await expect(
        actingAs(
          PERSON.ivan,
          (tx) =>
            tx.$executeRaw`UPDATE requisitions
              SET status = 'APPROVED', approval_route = 'UNDER_THRESHOLD',
                  decision_note = 'Self-approved'
              WHERE id = ${draft.id}::uuid`,
        ),
      ).rejects.toThrow(/does not match/);

      const req = await submitted(60000);
      await expect(
        actingAs(PERSON.hanna, async (tx) => {
          await tx.$executeRaw`INSERT INTO requisition_decisions
            (company_id, requisition_id, actor_person_id, outcome)
            VALUES (${MEGA}::uuid, ${req.id}::uuid, ${PERSON.hanna}::uuid, 'APPROVED')`;
          return tx.$executeRaw`UPDATE requisitions
            SET status = 'APPROVED', justification = 'Rewritten'
            WHERE id = ${req.id}::uuid`;
        }),
      ).rejects.toThrow(/changes nothing else/);
    });

    it('never lets a decision row be changed or removed', async () => {
      const req = await submitted(60000);
      await (
        await as(PERSON.hanna)
      )
        .approveRequisition(MEGA, req.id)
        .expect(200);
      for (const sql of [
        `UPDATE requisition_decisions SET outcome = 'REJECTED'`,
        `DELETE FROM requisition_decisions`,
      ]) {
        await expect(
          actingAs(PERSON.gustav, (tx) => tx.$executeRawUnsafe(sql)),
        ).rejects.toThrow(/permission denied/);
      }
    });
  });
});
