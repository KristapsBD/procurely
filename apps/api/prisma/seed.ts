import { PrismaClient } from '@prisma/client';
import { seedRows } from './seed-rows';
import type { SeedRows } from './seed-types';

// The BEFORE INSERT triggers of these two tables fire before ON CONFLICT can skip a duplicate, so a
// second seed run would be refused. Rows already present are left out instead.
async function missing<T extends { id?: string }>(
  rows: T[],
  existing: Promise<{ id: string }[]>,
): Promise<T[]> {
  const present = new Set((await existing).map((r) => r.id));
  return rows.filter((r) => !present.has(r.id!));
}

/** One createMany per table, in foreign-key order. A run on a seeded database changes nothing. */
export async function insertAll(prisma: PrismaClient, rows: SeedRows) {
  await prisma.company.createMany({
    data: rows.companies,
    skipDuplicates: true,
  });
  await prisma.person.createMany({ data: rows.people, skipDuplicates: true });
  await prisma.membership.createMany({
    data: rows.memberships,
    skipDuplicates: true,
  });
  await prisma.costCenter.createMany({
    data: rows.costCenters,
    skipDuplicates: true,
  });
  await prisma.supplier.createMany({
    data: rows.suppliers,
    skipDuplicates: true,
  });
  await prisma.catalogItem.createMany({
    data: rows.catalogItems,
    skipDuplicates: true,
  });
  await prisma.approvalRule.createMany({
    data: rows.approvalRules,
    skipDuplicates: true,
  });
  await prisma.requisition.createMany({
    data: rows.requisitions,
    skipDuplicates: true,
  });
  await prisma.requisitionLine.createMany({
    data: rows.requisitionLines,
    skipDuplicates: true,
  });
  await prisma.requisitionDecision.createMany({
    data: rows.requisitionDecisions,
    skipDuplicates: true,
  });
  await prisma.purchaseOrder.createMany({
    data: rows.purchaseOrders,
    skipDuplicates: true,
  });
  await prisma.purchaseOrderLine.createMany({
    data: rows.purchaseOrderLines,
    skipDuplicates: true,
  });
  await prisma.goodsReceipt.createMany({
    data: rows.goodsReceipts,
    skipDuplicates: true,
  });
  await prisma.goodsReceiptLine.createMany({
    data: await missing(
      rows.goodsReceiptLines,
      prisma.goodsReceiptLine.findMany({ select: { id: true } }),
    ),
    skipDuplicates: true,
  });
  await prisma.purchaseOrderClosure.createMany({
    data: await missing(
      rows.purchaseOrderClosures,
      prisma.purchaseOrderClosure.findMany({ select: { id: true } }),
    ),
    skipDuplicates: true,
  });
  await prisma.pushDevice.createMany({
    data: rows.pushDevices,
    skipDuplicates: true,
  });
  await prisma.auditLog.createMany({
    data: rows.auditLog,
    skipDuplicates: true,
  });
}

// Runs as the database owner (DIRECT_URL): the API role cannot write these tables.
async function main() {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  try {
    await insertAll(prisma, seedRows());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
