import type { INestApplication } from '@nestjs/common';
import type { CostCenter, MeResponse } from '@procurely/shared-types';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const codes = (rows: CostCenter[]) => rows.map((r) => r.code);
const OTHER_COMPANIES = [COMPANY.main, COMPANY.sek, COMPANY.large];

describe('company isolation of cost centers', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  const as = (personId: string) => Actor.signIn(app, personId);

  describe('reading', () => {
    it('shows a member only the company they act in', async () => {
      const dave = await as(PERSON.dave);
      const res = await dave.listCostCenters(COMPANY.main).expect(200);
      expect(codes(res.body)).toEqual(['IT', 'MKT', 'OPS']);
      expect(
        res.body.every((r: CostCenter) => r.companyId === COMPANY.main),
      ).toBe(true);
    });

    it('shows nothing for a company the person does not belong to', async () => {
      const dave = await as(PERSON.dave);
      for (const other of [COMPANY.sek, COMPANY.large, COMPANY.empty]) {
        const res = await dave.listCostCenters(other).expect(200);
        expect(res.body).toEqual([]);
      }
    });

    it('lets a two-company person act in each company with that company only', async () => {
      const alice = await as(PERSON.alice);
      const main = await alice.listCostCenters(COMPANY.main).expect(200);
      const sek = await alice.listCostCenters(COMPANY.sek).expect(200);
      expect(codes(main.body)).toEqual(['IT', 'MKT', 'OPS']);
      expect(codes(sek.body)).toEqual(['OPS', 'SALES']);
      const large = await alice.listCostCenters(COMPANY.large).expect(200);
      expect(large.body).toEqual([]);
    });

    it('shows a two-company person their different role in each company', async () => {
      const alice = await as(PERSON.alice);
      const res = await alice.me().expect(200);
      const me = res.body as MeResponse;
      const roles = Object.fromEntries(
        me.memberships.map((m) => [m.companyId, m.role]),
      );
      expect(roles).toEqual({
        [COMPANY.main]: 'REQUESTER',
        [COMPANY.sek]: 'APPROVER',
      });
      expect(
        me.memberships.find((m) => m.companyId === COMPANY.sek)?.currency,
      ).toBe('SEK');
    });

    it('gives a person with no company an empty state, not an error', async () => {
      const nomad = await as(PERSON.nomad);
      expect((await nomad.me().expect(200)).body.memberships).toEqual([]);
      for (const company of Object.values(COMPANY)) {
        expect((await nomad.listCostCenters(company).expect(200)).body).toEqual(
          [],
        );
      }
    });

    it('withdraws access when a membership is deactivated', async () => {
      const oscar = await as(PERSON.oscar);
      expect((await oscar.me().expect(200)).body.memberships).toEqual([]);
      const res = await oscar.listCostCenters(COMPANY.main).expect(200);
      expect(res.body).toEqual([]);
    });

    it('does not let an identity leak from one request to the next', async () => {
      const dave = await as(PERSON.dave);
      const mallory = await as(PERSON.mallory);
      for (let i = 0; i < 6; i++) {
        expect(
          (await dave.listCostCenters(COMPANY.main).expect(200)).body,
        ).toHaveLength(3);
        expect(
          (await mallory.listCostCenters(COMPANY.main).expect(200)).body,
        ).toEqual([]);
      }
    });

    it('requires a valid company header for company-scoped routes', async () => {
      const dave = await as(PERSON.dave);
      await dave.listCostCenters().expect(400);
      await dave.listCostCenters('not-a-uuid').expect(400);
    });
  });

  describe('the attacker, who belongs only to the empty company', () => {
    it('reads nothing from any other company', async () => {
      const mallory = await as(PERSON.mallory);
      for (const company of OTHER_COMPANIES) {
        const res = await mallory.listCostCenters(company).expect(200);
        expect(res.body).toEqual([]);
      }
    });

    it('cannot fetch another company’s cost center by id', async () => {
      const dave = await as(PERSON.dave);
      const mallory = await as(PERSON.mallory);
      const victim = (await dave.listCostCenters(COMPANY.main).expect(200))
        .body[0];
      for (const company of [COMPANY.empty, ...OTHER_COMPANIES]) {
        await mallory.getCostCenter(company, victim.id).expect(404);
      }
    });

    it('cannot create cost centers in any other company', async () => {
      const mallory = await as(PERSON.mallory);
      for (const company of OTHER_COMPANIES) {
        await mallory
          .createCostCenter(company, { code: 'EVIL', name: 'Planted' })
          .expect(403);
      }
    });

    it('cannot rename or delete another company’s cost center', async () => {
      const dave = await as(PERSON.dave);
      const mallory = await as(PERSON.mallory);
      const victim = (await dave.listCostCenters(COMPANY.main).expect(200))
        .body[0];
      for (const company of OTHER_COMPANIES) {
        await mallory
          .renameCostCenter(company, victim.id, 'Hacked')
          .expect(404);
        await mallory.deleteCostCenter(company, victim.id).expect(404);
      }
      // In her own company she is a requester: refused by role, and the row is not there anyway.
      await mallory
        .renameCostCenter(COMPANY.empty, victim.id, 'Hacked')
        .expect(403);
      await mallory.deleteCostCenter(COMPANY.empty, victim.id).expect(403);
      const after = (
        await dave.getCostCenter(COMPANY.main, victim.id).expect(200)
      ).body;
      expect(after.name).toBe(victim.name);
    });

    it('does not let a member of one company write into another', async () => {
      const dave = await as(PERSON.dave);
      const erik = await as(PERSON.erik);
      const victim = (await erik.listCostCenters(COMPANY.sek).expect(200))
        .body[0];
      await dave
        .createCostCenter(COMPANY.sek, { code: 'EVIL', name: 'x' })
        .expect(403);
      await dave.renameCostCenter(COMPANY.sek, victim.id, 'Hacked').expect(404);
      await dave.deleteCostCenter(COMPANY.sek, victim.id).expect(404);
      // Acting in his own company does not widen access to rows of another.
      await dave
        .renameCostCenter(COMPANY.main, victim.id, 'Hacked')
        .expect(404);
      await dave.deleteCostCenter(COMPANY.main, victim.id).expect(404);
      const after = (await erik.listCostCenters(COMPANY.sek).expect(200)).body;
      expect(codes(after)).toEqual(['OPS', 'SALES']);
      expect(after[0].name).toBe(victim.name);
    });

    it('leaves every other company’s data untouched', async () => {
      const mallory = await as(PERSON.mallory);
      await mallory
        .createCostCenter(COMPANY.main, { code: 'EVIL', name: 'x' })
        .expect(403);
      const dave = await as(PERSON.dave);
      expect(
        codes((await dave.listCostCenters(COMPANY.main).expect(200)).body),
      ).toEqual(['IT', 'MKT', 'OPS']);
    });
  });

  describe('writing', () => {
    it('lets a member manage cost centers of their own company', async () => {
      const gustav = await as(PERSON.gustav);
      const created = await gustav
        .createCostCenter(COMPANY.large, { code: 'R&D', name: 'Research' })
        .expect(201);
      expect(created.body).toMatchObject({
        companyId: COMPANY.large,
        code: 'R&D',
      });
      const id = created.body.id as string;
      await gustav
        .renameCostCenter(COMPANY.large, id, 'Research and Development')
        .expect(200);
      expect(
        (await gustav.getCostCenter(COMPANY.large, id).expect(200)).body.name,
      ).toBe('Research and Development');
      await gustav.deleteCostCenter(COMPANY.large, id).expect(204);
      await gustav.getCostCenter(COMPANY.large, id).expect(404);
    });

    it('ignores a company id smuggled into the body', async () => {
      const dave = await as(PERSON.dave);
      const res = await dave
        .createCostCenter(COMPANY.main, {
          code: 'SMUGGLE',
          name: 'x',
          companyId: COMPANY.large,
        })
        .expect(201);
      expect(res.body.companyId).toBe(COMPANY.main);
      await dave.deleteCostCenter(COMPANY.main, res.body.id).expect(204);
    });

    it('rejects writes by a deactivated member and a person with no company', async () => {
      for (const person of [PERSON.oscar, PERSON.nomad]) {
        const actor = await as(person);
        await actor
          .createCostCenter(COMPANY.main, { code: 'X', name: 'x' })
          .expect(403);
      }
    });

    it('allows the same code in two companies but not twice in one', async () => {
      const dave = await as(PERSON.dave);
      await dave
        .createCostCenter(COMPANY.main, { code: 'IT', name: 'Duplicate' })
        .expect(409);
    });
  });
});
