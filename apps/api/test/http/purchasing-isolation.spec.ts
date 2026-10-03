import type { INestApplication } from '@nestjs/common';
import type { CatalogItem, Supplier } from '@procurely/shared-types';
import {
  CATALOG_ITEM,
  COMPANY,
  PERSON,
  SUPPLIER,
} from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const OTHER_COMPANIES = [COMPANY.main, COMPANY.sek, COMPANY.large];
const PAPER = 'A4 copy paper, box of 5 reams';

// "Office Depot" exists in the main (EUR) and the SEK company, each with its own agreed price
// for the same paper. Alice is a requester in main and an approver in SEK.
describe('company isolation of suppliers and catalog prices', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  const paperIn = async (actor: Actor, companyId: string) =>
    (
      (await actor.listCatalogItems(companyId).expect(200))
        .body as CatalogItem[]
    ).filter((i) => i.name === PAPER);

  it('keeps the same supplier name in two companies apart, each with its own price', async () => {
    const carol = await as(PERSON.carol);
    const erik = await as(PERSON.erik);
    expect(await paperIn(carol, COMPANY.main)).toEqual([
      expect.objectContaining({
        id: CATALOG_ITEM.mainPaper,
        companyId: COMPANY.main,
        supplierId: SUPPLIER.mainOffice,
        supplierName: 'Office Depot',
        unitPriceMinor: 2499,
      }),
    ]);
    expect(await paperIn(erik, COMPANY.sek)).toEqual([
      expect.objectContaining({
        id: CATALOG_ITEM.sekPaper,
        companyId: COMPANY.sek,
        supplierId: SUPPLIER.sekOffice,
        supplierName: 'Office Depot',
        unitPriceMinor: 27900,
      }),
    ]);
  });

  it('shows a two-company person only the price of the company they act in', async () => {
    const alice = await as(PERSON.alice);
    const main = await paperIn(alice, COMPANY.main);
    const sek = await paperIn(alice, COMPANY.sek);
    expect(main.map((i) => i.unitPriceMinor)).toEqual([2499]);
    expect(sek.map((i) => i.unitPriceMinor)).toEqual([27900]);
    const sekSuppliers = (await alice.listSuppliers(COMPANY.sek).expect(200))
      .body as Supplier[];
    expect(sekSuppliers.map((s) => s.id)).toContain(SUPPLIER.sekOffice);
    expect(sekSuppliers.every((s) => s.companyId === COMPANY.sek)).toBe(true);
    // Naming the other company's record while acting in this one finds nothing.
    await alice.getCatalogItem(COMPANY.main, CATALOG_ITEM.sekPaper).expect(404);
    await alice.getSupplier(COMPANY.sek, SUPPLIER.mainOffice).expect(404);
  });

  it('shows a member of one company nothing of another', async () => {
    const carol = await as(PERSON.carol);
    for (const other of [COMPANY.sek, COMPANY.large, COMPANY.empty]) {
      expect((await carol.listSuppliers(other).expect(200)).body).toEqual([]);
      expect((await carol.listCatalogItems(other).expect(200)).body).toEqual(
        [],
      );
    }
  });

  describe('the attacker, who belongs only to the empty company', () => {
    it('reads no supplier, item or price of any other company', async () => {
      const mallory = await as(PERSON.mallory);
      for (const company of [COMPANY.empty, ...OTHER_COMPANIES]) {
        expect((await mallory.listSuppliers(company).expect(200)).body).toEqual(
          [],
        );
        expect(
          (await mallory.listCatalogItems(company).expect(200)).body,
        ).toEqual([]);
        await mallory.getSupplier(company, SUPPLIER.mainOffice).expect(404);
        await mallory
          .getCatalogItem(company, CATALOG_ITEM.mainPaper)
          .expect(404);
      }
    });

    it('cannot create, change or delete suppliers or items anywhere', async () => {
      const mallory = await as(PERSON.mallory);
      for (const company of [COMPANY.empty, ...OTHER_COMPANIES]) {
        await mallory
          .createSupplier(company, { name: 'Evil Corp' })
          .expect(403);
        await mallory
          .createCatalogItem(company, {
            supplierId: SUPPLIER.mainOffice,
            name: 'Evil item',
            unitPriceMinor: 1,
          })
          .expect(403);
        await mallory
          .updateSupplier(company, SUPPLIER.mainOffice, { active: false })
          .expect(company === COMPANY.empty ? 403 : 404);
        await mallory
          .updateCatalogItem(company, CATALOG_ITEM.mainPaper, {
            unitPriceMinor: 1,
          })
          .expect(company === COMPANY.empty ? 403 : 404);
        await mallory
          .deleteCatalogItem(company, CATALOG_ITEM.mainPaper)
          .expect(company === COMPANY.empty ? 403 : 404);
      }
      const carol = await as(PERSON.carol);
      expect(
        (await carol.getSupplier(COMPANY.main, SUPPLIER.mainOffice)).body
          .active,
      ).toBe(true);
      expect(await paperIn(carol, COMPANY.main)).toEqual([
        expect.objectContaining({ unitPriceMinor: 2499 }),
      ]);
    });

    it('is refused as a deactivated member or a person with no company', async () => {
      for (const person of [PERSON.oscar, PERSON.nomad]) {
        const actor = await as(person);
        expect(
          (await actor.listCatalogItems(COMPANY.main).expect(200)).body,
        ).toEqual([]);
        await actor
          .createSupplier(COMPANY.main, { name: 'Ghost Supplies' })
          .expect(403);
      }
    });
  });

  describe('a buyer or admin of one company', () => {
    it('cannot change another company’s supplier or item, even acting in their own company', async () => {
      const carol = await as(PERSON.carol);
      for (const company of [COMPANY.main, COMPANY.sek]) {
        await carol
          .updateSupplier(company, SUPPLIER.sekOffice, { name: 'Hacked' })
          .expect(404);
        await carol
          .updateCatalogItem(company, CATALOG_ITEM.sekPaper, {
            unitPriceMinor: 1,
          })
          .expect(404);
        await carol
          .deleteCatalogItem(company, CATALOG_ITEM.sekPaper)
          .expect(404);
      }
      const erik = await as(PERSON.erik);
      expect(await paperIn(erik, COMPANY.sek)).toEqual([
        expect.objectContaining({ unitPriceMinor: 27900 }),
      ]);
      expect(
        (await erik.getSupplier(COMPANY.sek, SUPPLIER.sekOffice)).body.name,
      ).toBe('Office Depot');
    });

    it('cannot attach another company’s supplier to an item of their own', async () => {
      const carol = await as(PERSON.carol);
      await carol
        .createCatalogItem(COMPANY.main, {
          supplierId: SUPPLIER.sekOffice,
          name: 'Borrowed supplier',
          unitPriceMinor: 100,
        })
        .expect(400);
      await carol
        .updateCatalogItem(COMPANY.main, CATALOG_ITEM.mainLaptop, {
          supplierId: SUPPLIER.sekOffice,
        })
        .expect(400);
      expect(
        (await carol.getCatalogItem(COMPANY.main, CATALOG_ITEM.mainLaptop)).body
          .supplierId,
      ).toBe(SUPPLIER.mainTech);
    });

    it('ignores a company id smuggled into the body', async () => {
      const carol = await as(PERSON.carol);
      const res = await carol
        .createSupplier(COMPANY.main, {
          name: 'Smuggled Supplies',
          companyId: COMPANY.sek,
        })
        .expect(201);
      expect(res.body.companyId).toBe(COMPANY.main);
      const erik = await as(PERSON.erik);
      expect(
        ((await erik.listSuppliers(COMPANY.sek)).body as Supplier[]).map(
          (s) => s.name,
        ),
      ).not.toContain('Smuggled Supplies');
    });
  });
});
