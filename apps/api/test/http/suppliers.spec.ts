import type { INestApplication } from '@nestjs/common';
import type { AuditEntry, Supplier } from '@procurely/shared-types';
import { COMPANY, PERSON, SUPPLIER } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const names = (rows: Supplier[]) => rows.map((r) => r.name);
// Other specs add suppliers too and the file order is not fixed: look at the seeded ones.
const SEEDED: string[] = Object.values(SUPPLIER);
const seeded = (rows: Supplier[]) => rows.filter((r) => SEEDED.includes(r.id));

// Main company: alice requester, bob approver, carol buyer, dave admin.
describe('suppliers', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  /** The audit entries an admin of the company sees for one record, oldest first. */
  async function auditOf(companyId: string, admin: string, entityId: string) {
    const log = (await (await as(admin)).auditLog(companyId).expect(200))
      .body as AuditEntry[];
    return log.filter((e) => e.entityId === entityId).reverse();
  }

  describe('reading', () => {
    it('lets every role list the company’s suppliers, inactive ones included', async () => {
      for (const person of [
        PERSON.alice,
        PERSON.bob,
        PERSON.carol,
        PERSON.dave,
      ]) {
        const actor = await as(person);
        const res = await actor.listSuppliers(COMPANY.main).expect(200);
        expect(names(seeded(res.body))).toEqual([
          'Office Depot',
          'Old Paper Mill',
          'TechWorld',
        ]);
        expect(
          (res.body as Supplier[]).find((s) => s.name === 'Old Paper Mill')
            ?.active,
        ).toBe(false);
      }
    });

    it('leaves inactive suppliers out of the selectable list for new work', async () => {
      const carol = await as(PERSON.carol);
      const res = await carol
        .listSuppliers(COMPANY.main, { selectable: true })
        .expect(200);
      expect(names(seeded(res.body))).toEqual(['Office Depot', 'TechWorld']);
      expect((res.body as Supplier[]).every((s) => s.active)).toBe(true);
      expect(
        (res.body as Supplier[]).every((s) => s.companyId === COMPANY.main),
      ).toBe(true);
    });

    it('fetches one supplier by id, and 404s an unknown one', async () => {
      const alice = await as(PERSON.alice);
      const res = await alice
        .getSupplier(COMPANY.main, SUPPLIER.mainOffice)
        .expect(200);
      expect(res.body).toEqual({
        id: SUPPLIER.mainOffice,
        companyId: COMPANY.main,
        name: 'Office Depot',
        active: true,
      });
      await alice
        .getSupplier(COMPANY.main, '11111111-1111-4111-8111-111111111111')
        .expect(404);
    });
  });

  describe('writing', () => {
    it('lets a buyer create, rename, deactivate and reactivate a supplier, with an audit entry for each change', async () => {
      const carol = await as(PERSON.carol);
      const created = await carol
        .createSupplier(COMPANY.main, { name: '  Paper Partners ' })
        .expect(201);
      expect(created.body).toMatchObject({
        companyId: COMPANY.main,
        name: 'Paper Partners',
        active: true,
      });
      const id = created.body.id as string;

      const renamed = await carol
        .updateSupplier(COMPANY.main, id, { name: 'Paper Partners AB' })
        .expect(200);
      expect(renamed.body).toMatchObject({
        name: 'Paper Partners AB',
        active: true,
      });
      const deactivated = await carol
        .updateSupplier(COMPANY.main, id, { active: false })
        .expect(200);
      expect(deactivated.body.active).toBe(false);
      const selectable = await carol
        .listSuppliers(COMPANY.main, { selectable: true })
        .expect(200);
      expect(names(selectable.body)).not.toContain('Paper Partners AB');
      await carol
        .updateSupplier(COMPANY.main, id, { active: true })
        .expect(200);

      const entries = await auditOf(COMPANY.main, PERSON.dave, id);
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['supplier.created', PERSON.carol],
        ['supplier.renamed', PERSON.carol],
        ['supplier.deactivated', PERSON.carol],
        ['supplier.reactivated', PERSON.carol],
      ]);
      expect(entries[1].details).toEqual({
        from: 'Paper Partners',
        to: 'Paper Partners AB',
      });
    });

    it('lets an admin manage suppliers too', async () => {
      const erik = await as(PERSON.erik);
      const created = await erik
        .createSupplier(COMPANY.sek, { name: 'Kontorsvaror' })
        .expect(201);
      await erik
        .updateSupplier(COMPANY.sek, created.body.id, { active: false })
        .expect(200);
    });

    it('refuses writes by a requester and an approver, and changes nothing', async () => {
      for (const person of [PERSON.alice, PERSON.bob]) {
        const actor = await as(person);
        await actor
          .createSupplier(COMPANY.main, { name: 'Sneaky Supplies' })
          .expect(403);
        await actor
          .updateSupplier(COMPANY.main, SUPPLIER.mainOffice, {
            name: 'Hacked',
          })
          .expect(403);
        await actor
          .updateSupplier(COMPANY.main, SUPPLIER.mainOffice, { active: false })
          .expect(403);
      }
      const after = await (
        await as(PERSON.dave)
      )
        .getSupplier(COMPANY.main, SUPPLIER.mainOffice)
        .expect(200);
      expect(after.body).toMatchObject({ name: 'Office Depot', active: true });
      const all = await (
        await as(PERSON.dave)
      )
        .listSuppliers(COMPANY.main)
        .expect(200);
      expect(names(all.body)).not.toContain('Sneaky Supplies');
    });

    it('reports a missing supplier as 404 to a buyer', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .updateSupplier(COMPANY.main, '11111111-1111-4111-8111-111111111111', {
          name: 'x',
        })
        .expect(404);
    });

    it('rejects a duplicate name within one company', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .createSupplier(COMPANY.main, { name: 'Office Depot' })
        .expect(409);
      await carol
        .updateSupplier(COMPANY.main, SUPPLIER.mainTech, {
          name: 'Office Depot',
        })
        .expect(409);
    });

    it('validates the request body', async () => {
      const carol = await as(PERSON.carol);
      await carol.createSupplier(COMPANY.main, {}).expect(400);
      await carol.createSupplier(COMPANY.main, { name: '   ' }).expect(400);
      await carol
        .updateSupplier(COMPANY.main, SUPPLIER.mainOffice, {})
        .expect(400);
      await carol
        .updateSupplier(COMPANY.main, SUPPLIER.mainOffice, { active: 'no' })
        .expect(400);
      await carol
        .updateSupplier(COMPANY.main, SUPPLIER.mainOffice, { name: '' })
        .expect(400);
    });

    it('writes no audit entry when nothing changes', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .updateSupplier(COMPANY.main, SUPPLIER.mainTech, {
          name: 'TechWorld',
          active: true,
        })
        .expect(200);
      expect(
        await auditOf(COMPANY.main, PERSON.dave, SUPPLIER.mainTech),
      ).toEqual([]);
    });
  });
});
