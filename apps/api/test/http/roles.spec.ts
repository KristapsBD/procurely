import type { INestApplication } from '@nestjs/common';
import type { AuditEntry, CostCenter } from '@procurely/shared-types';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

// Main company: alice requester, bob approver, carol buyer, dave admin.
const NON_ADMINS = [PERSON.alice, PERSON.bob, PERSON.carol];

describe('role rules inside a company', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  describe('cost centers: every active member reads, only admins write', () => {
    it('lets every role read them', async () => {
      for (const person of [...NON_ADMINS, PERSON.dave]) {
        const actor = await as(person);
        const res = await actor.listCostCenters(COMPANY.main).expect(200);
        expect(res.body.map((c: CostCenter) => c.code)).toEqual([
          'IT',
          'MKT',
          'OPS',
        ]);
      }
    });

    it('refuses writes by requester, approver and buyer, and changes nothing', async () => {
      const dave = await as(PERSON.dave);
      const target = (await dave.listCostCenters(COMPANY.main).expect(200))
        .body[0] as CostCenter;
      for (const person of NON_ADMINS) {
        const actor = await as(person);
        await actor
          .createCostCenter(COMPANY.main, { code: 'NOPE', name: 'x' })
          .expect(403);
        await actor
          .renameCostCenter(COMPANY.main, target.id, 'Hacked')
          .expect(403);
        await actor.deleteCostCenter(COMPANY.main, target.id).expect(403);
      }
      const after = (await dave.listCostCenters(COMPANY.main).expect(200))
        .body as CostCenter[];
      expect(after.map((c) => c.code)).toEqual(['IT', 'MKT', 'OPS']);
      expect(after.find((c) => c.id === target.id)?.name).toBe(target.name);
    });

    it('lets an admin write, with an audit entry for every change', async () => {
      const dave = await as(PERSON.dave);
      const created = await dave
        .createCostCenter(COMPANY.main, { code: 'ROLE', name: 'Role test' })
        .expect(201);
      const id = created.body.id as string;
      await dave.renameCostCenter(COMPANY.main, id, 'Role test 2').expect(200);
      await dave.deleteCostCenter(COMPANY.main, id).expect(204);

      const log = (await dave.auditLog(COMPANY.main).expect(200))
        .body as AuditEntry[];
      const entries = log.filter((e) => e.entityId === id).reverse();
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['cost_center.created', PERSON.dave],
        ['cost_center.renamed', PERSON.dave],
        ['cost_center.deleted', PERSON.dave],
      ]);
      expect(entries.map((e) => e.details)).toEqual([
        { code: 'ROLE', name: 'Role test' },
        { code: 'ROLE', from: 'Role test', to: 'Role test 2' },
        { code: 'ROLE', name: 'Role test 2' },
      ]);
    });

    it('writes no audit entry for a refused change', async () => {
      const dave = await as(PERSON.dave);
      const before = (await dave.auditLog(COMPANY.main).expect(200)).body
        .length as number;
      const carol = await as(PERSON.carol);
      await carol
        .createCostCenter(COMPANY.main, { code: 'NOPE', name: 'x' })
        .expect(403);
      await dave
        .createCostCenter(COMPANY.main, { code: 'IT', name: 'Duplicate' })
        .expect(409);
      expect((await dave.auditLog(COMPANY.main).expect(200)).body).toHaveLength(
        before,
      );
    });

    it('reports a missing cost center as 404 to an admin', async () => {
      const dave = await as(PERSON.dave);
      const missing = '11111111-1111-4111-8111-111111111111';
      await dave.renameCostCenter(COMPANY.main, missing, 'x').expect(404);
      await dave.deleteCostCenter(COMPANY.main, missing).expect(404);
    });
  });

  describe('audit log: only admins read it', () => {
    it('shows an admin their own company’s entries', async () => {
      const dave = await as(PERSON.dave);
      const log = (await dave.auditLog(COMPANY.main).expect(200))
        .body as AuditEntry[];
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log.map((e) => e.action)).toEqual(
        expect.arrayContaining(['member.invited', 'member.deactivated']),
      );
    });

    it('shows requester, approver and buyer nothing', async () => {
      for (const person of NON_ADMINS) {
        const actor = await as(person);
        expect((await actor.auditLog(COMPANY.main).expect(200)).body).toEqual(
          [],
        );
      }
    });

    it('does not show an admin another company’s entries', async () => {
      const dave = await as(PERSON.dave);
      expect((await dave.auditLog(COMPANY.sek).expect(200)).body).toEqual([]);
      const erik = await as(PERSON.erik);
      const sek = (await erik.auditLog(COMPANY.sek).expect(200))
        .body as AuditEntry[];
      expect(sek.length).toBeGreaterThan(0);
    });

    it('shows the attacker, a deactivated member and a person with no company nothing', async () => {
      for (const person of [PERSON.mallory, PERSON.oscar, PERSON.nomad]) {
        const actor = await as(person);
        for (const company of Object.values(COMPANY)) {
          expect((await actor.auditLog(company).expect(200)).body).toEqual([]);
        }
      }
    });

    it('requires the company header', async () => {
      const dave = await as(PERSON.dave);
      await dave.auditLog('not-a-uuid').expect(400);
    });
  });
});
