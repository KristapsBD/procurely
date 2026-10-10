import { PrismaClient } from '@prisma/client';
import { insertAll } from '../../prisma/seed-insert';
import { seedRows } from '../../prisma/seed-rows';

describe('seeding a database that is already seeded', () => {
  const owner = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  afterAll(() => owner.$disconnect());

  const counts = async () => ({
    requisitions: await owner.requisition.count(),
    goodsReceiptLines: await owner.goodsReceiptLine.count(),
    purchaseOrderClosures: await owner.purchaseOrderClosure.count(),
    auditLog: await owner.auditLog.count(),
  });

  it('adds nothing and trips no trigger', async () => {
    const before = await counts();
    await expect(insertAll(owner, seedRows())).resolves.toBeUndefined();
    expect(await counts()).toEqual(before);
  });
});
