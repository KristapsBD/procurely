import type { INestApplication } from '@nestjs/common';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { writeAudit } from '../../src/audit/audit-log';
import { TenantDb } from '../../src/tenancy/tenant-db.service';
import { startApp } from './harness';

// Update and delete have no HTTP route, so this seam is the database itself: the same
// TenantDb path every handler uses, with the identity of a real admin. It proves the
// database refuses even if some future handler tried.
describe('the audit log is append-only', () => {
  let app: INestApplication;
  let db: TenantDb;
  beforeAll(async () => {
    app = await startApp();
    db = app.get(TenantDb);
  });
  afterAll(() => app.close());

  const admin = { personId: PERSON.dave, companyId: COMPANY.main };
  const entry = { action: 'test.appended', entityType: 'test' };

  const countAppended = (scope = admin) =>
    db.run(scope, (tx) =>
      tx.auditLog.count({ where: { action: 'test.appended' } }),
    );

  it('accepts inserts and selects', async () => {
    const before = await countAppended();
    await db.run(admin, (tx) => writeAudit(tx, admin, entry));
    expect(await countAppended()).toBe(before + 1);
  });

  it('refuses updates, even by an admin of the company', async () => {
    await db.run(admin, (tx) => writeAudit(tx, admin, entry));
    await expect(
      db.run(admin, (tx) =>
        tx.auditLog.updateMany({ data: { action: 'tampered' } }),
      ),
    ).rejects.toThrow();
    expect(
      await db.run(admin, (tx) =>
        tx.auditLog.count({ where: { action: 'tampered' } }),
      ),
    ).toBe(0);
  });

  it('refuses deletes, even by an admin of the company', async () => {
    await db.run(admin, (tx) => writeAudit(tx, admin, entry));
    const before = await countAppended();
    await expect(
      db.run(admin, (tx) => tx.auditLog.deleteMany({})),
    ).rejects.toThrow();
    expect(await countAppended()).toBe(before);
  });

  it('lets any active member append an entry as themselves, but not read', async () => {
    const alice = { personId: PERSON.alice, companyId: COMPANY.main };
    const before = await countAppended();
    await db.run(alice, (tx) => writeAudit(tx, alice, entry));
    expect(await db.run(alice, (tx) => tx.auditLog.count())).toBe(0);
    expect(await countAppended()).toBe(before + 1);
  });

  it('refuses entries for another company, as another person, or by a non-member', async () => {
    const dave = admin;
    const intoOtherCompany = { personId: PERSON.dave, companyId: COMPANY.sek };
    await expect(
      db.run(intoOtherCompany, (tx) => writeAudit(tx, intoOtherCompany, entry)),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.run(dave, (tx) =>
        writeAudit(
          tx,
          { personId: PERSON.erik, companyId: COMPANY.main },
          entry,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const mallory = { personId: PERSON.mallory, companyId: COMPANY.main };
    await expect(
      db.run(mallory, (tx) => writeAudit(tx, mallory, entry)),
    ).rejects.toThrow(/row-level security/);
  });
});
