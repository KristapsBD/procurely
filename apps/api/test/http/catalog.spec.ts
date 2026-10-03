import type { INestApplication } from '@nestjs/common';
import type { AuditEntry, CatalogItem } from '@procurely/shared-types';
import {
  CATALOG_ITEM,
  COMPANY,
  PERSON,
  SUPPLIER,
} from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const MISSING = '11111111-1111-4111-8111-111111111111';

// Main company: alice requester, bob approver, carol buyer, dave admin.
describe('catalog items', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  async function auditOf(entityId: string) {
    const log = (await (await as(PERSON.dave)).auditLog(COMPANY.main))
      .body as AuditEntry[];
    return log.filter((e) => e.entityId === entityId).reverse();
  }

  describe('reading', () => {
    it('lets every role read items with their supplier and agreed price', async () => {
      for (const person of [
        PERSON.alice,
        PERSON.bob,
        PERSON.carol,
        PERSON.dave,
      ]) {
        const actor = await as(person);
        const res = await actor.listCatalogItems(COMPANY.main).expect(200);
        const paper = (res.body as CatalogItem[]).find(
          (i) => i.id === CATALOG_ITEM.mainPaper,
        );
        expect(paper).toEqual({
          id: CATALOG_ITEM.mainPaper,
          companyId: COMPANY.main,
          supplierId: SUPPLIER.mainOffice,
          supplierName: 'Office Depot',
          supplierActive: true,
          name: 'A4 copy paper, box of 5 reams',
          unitPriceMinor: 2499,
        });
      }
    });

    it('marks the items of an inactive supplier and leaves them out of the selectable list', async () => {
      const alice = await as(PERSON.alice);
      const all = (await alice.listCatalogItems(COMPANY.main).expect(200))
        .body as CatalogItem[];
      expect(
        all.find((i) => i.id === CATALOG_ITEM.mainOldPaper)?.supplierActive,
      ).toBe(false);
      const selectable = (
        await alice
          .listCatalogItems(COMPANY.main, { selectable: true })
          .expect(200)
      ).body as CatalogItem[];
      expect(selectable.map((i) => i.id)).not.toContain(
        CATALOG_ITEM.mainOldPaper,
      );
      expect(selectable.map((i) => i.id)).toEqual(
        expect.arrayContaining([CATALOG_ITEM.mainPaper]),
      );
      expect(selectable.every((i) => i.supplierActive)).toBe(true);
    });

    it('fetches one item by id, and 404s an unknown one', async () => {
      const alice = await as(PERSON.alice);
      const res = await alice
        .getCatalogItem(COMPANY.main, CATALOG_ITEM.mainLaptop)
        .expect(200);
      expect(res.body).toMatchObject({
        supplierName: 'TechWorld',
        unitPriceMinor: 119900,
      });
      await alice.getCatalogItem(COMPANY.main, MISSING).expect(404);
    });
  });

  describe('writing', () => {
    it('lets a buyer create, reprice, rename and delete an item, with an audit entry for each change', async () => {
      const carol = await as(PERSON.carol);
      const created = await carol
        .createCatalogItem(COMPANY.main, {
          supplierId: SUPPLIER.mainTech,
          name: ' USB-C dock ',
          unitPriceMinor: 8900,
        })
        .expect(201);
      expect(created.body).toMatchObject({
        companyId: COMPANY.main,
        supplierId: SUPPLIER.mainTech,
        supplierName: 'TechWorld',
        name: 'USB-C dock',
        unitPriceMinor: 8900,
      });
      const id = created.body.id as string;

      const updated = await carol
        .updateCatalogItem(COMPANY.main, id, {
          name: 'USB-C dock, 8 ports',
          unitPriceMinor: 9450,
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        name: 'USB-C dock, 8 ports',
        unitPriceMinor: 9450,
      });
      const moved = await carol
        .updateCatalogItem(COMPANY.main, id, {
          supplierId: SUPPLIER.mainOffice,
        })
        .expect(200);
      expect(moved.body.supplierName).toBe('Office Depot');
      await carol.deleteCatalogItem(COMPANY.main, id).expect(204);
      await carol.getCatalogItem(COMPANY.main, id).expect(404);

      const entries = await auditOf(id);
      expect(entries.map((e) => [e.action, e.actorPersonId])).toEqual([
        ['catalog_item.created', PERSON.carol],
        ['catalog_item.updated', PERSON.carol],
        ['catalog_item.updated', PERSON.carol],
        ['catalog_item.deleted', PERSON.carol],
      ]);
      expect(entries[0].details).toEqual({
        name: 'USB-C dock',
        supplierId: SUPPLIER.mainTech,
        unitPriceMinor: 8900,
      });
      expect(entries[1].details).toEqual({
        name: { from: 'USB-C dock', to: 'USB-C dock, 8 ports' },
        unitPriceMinor: { from: 8900, to: 9450 },
      });
      expect(entries[2].details).toEqual({
        supplierId: { from: SUPPLIER.mainTech, to: SUPPLIER.mainOffice },
      });
    });

    it('lets an admin manage items too', async () => {
      const dave = await as(PERSON.dave);
      const created = await dave
        .createCatalogItem(COMPANY.main, {
          supplierId: SUPPLIER.mainOffice,
          name: 'Stapler',
          unitPriceMinor: 750,
        })
        .expect(201);
      await dave.deleteCatalogItem(COMPANY.main, created.body.id).expect(204);
    });

    it('lets requesters and approvers only read: every write is refused and nothing changes', async () => {
      for (const person of [PERSON.alice, PERSON.bob]) {
        const actor = await as(person);
        await actor
          .createCatalogItem(COMPANY.main, {
            supplierId: SUPPLIER.mainOffice,
            name: 'Free lunch',
            unitPriceMinor: 0,
          })
          .expect(403);
        await actor
          .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper, {
            unitPriceMinor: 1,
          })
          .expect(403);
        await actor
          .deleteCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper)
          .expect(403);
      }
      const paper = await (
        await as(PERSON.carol)
      )
        .getCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper)
        .expect(200);
      expect(paper.body.unitPriceMinor).toBe(2499);
      const items = (
        await (await as(PERSON.carol)).listCatalogItems(COMPANY.main)
      ).body as CatalogItem[];
      expect(items.map((i) => i.name)).not.toContain('Free lunch');
    });

    it('does not offer an inactive supplier for new items', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .createCatalogItem(COMPANY.main, {
          supplierId: SUPPLIER.mainInactive,
          name: 'More recycled paper',
          unitPriceMinor: 1000,
        })
        .expect(409);
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainLaptop, {
          supplierId: SUPPLIER.mainInactive,
        })
        .expect(409);
      const laptop = await carol
        .getCatalogItem(COMPANY.main, CATALOG_ITEM.mainLaptop)
        .expect(200);
      expect(laptop.body.supplierId).toBe(SUPPLIER.mainTech);
    });

    it('still lets a buyer reprice an item of an inactive supplier', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainOldPaper, {
          unitPriceMinor: 2099,
        })
        .expect(200);
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainOldPaper, {
          unitPriceMinor: 1999,
        })
        .expect(200);
    });

    it('rejects an unknown supplier and a missing item', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .createCatalogItem(COMPANY.main, {
          supplierId: MISSING,
          name: 'Ghost',
          unitPriceMinor: 100,
        })
        .expect(400);
      await carol
        .updateCatalogItem(COMPANY.main, MISSING, { unitPriceMinor: 1 })
        .expect(404);
      await carol.deleteCatalogItem(COMPANY.main, MISSING).expect(404);
    });

    it('rejects the same item name twice for one supplier', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .createCatalogItem(COMPANY.main, {
          supplierId: SUPPLIER.mainOffice,
          name: 'A4 copy paper, box of 5 reams',
          unitPriceMinor: 1,
        })
        .expect(409);
    });

    it('validates the request body', async () => {
      const carol = await as(PERSON.carol);
      const valid = {
        supplierId: SUPPLIER.mainOffice,
        name: 'Pens',
        unitPriceMinor: 100,
      };
      for (const body of [
        {},
        { ...valid, supplierId: 'not-a-uuid' },
        { ...valid, name: ' ' },
        { ...valid, unitPriceMinor: -1 },
        { ...valid, unitPriceMinor: 1.5 },
        { ...valid, unitPriceMinor: '100' },
        { ...valid, unitPriceMinor: 2 ** 31 },
      ]) {
        await carol.createCatalogItem(COMPANY.main, body).expect(400);
      }
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper, {})
        .expect(400);
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainPaper, {
          unitPriceMinor: -5,
        })
        .expect(400);
    });
  });
});
