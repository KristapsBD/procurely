import { PrismaClient } from '@prisma/client';
import { seedRows } from './seed-rows';
import type { SeedRows } from './seed-types';

const CHUNK = 5000;

type Delegate = {
  createMany(args: {
    data: never[];
    skipDuplicates: boolean;
  }): Promise<unknown>;
};

async function insertChunks(delegate: Delegate, rows: unknown[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await delegate.createMany({
      data: rows.slice(i, i + CHUNK) as never[],
      skipDuplicates: true,
    });
  }
}

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
  await insertChunks(prisma.company, rows.companies);
  await insertChunks(prisma.person, rows.people);
  await insertChunks(prisma.membership, rows.memberships);
  await insertChunks(prisma.costCenter, rows.costCenters);
  await insertChunks(prisma.supplier, rows.suppliers);
  await insertChunks(prisma.catalogItem, rows.catalogItems);
  await insertChunks(prisma.approvalRule, rows.approvalRules);
  await insertChunks(prisma.requisition, rows.requisitions);
  await insertChunks(prisma.requisitionLine, rows.requisitionLines);
  await insertChunks(prisma.requisitionDecision, rows.requisitionDecisions);
  await insertChunks(prisma.purchaseOrder, rows.purchaseOrders);
  await insertChunks(prisma.purchaseOrderLine, rows.purchaseOrderLines);
  await insertChunks(prisma.goodsReceipt, rows.goodsReceipts);
  await insertChunks(
    prisma.goodsReceiptLine,
    await missing(
      rows.goodsReceiptLines,
      prisma.goodsReceiptLine.findMany({ select: { id: true } }),
    ),
  );
  await insertChunks(
    prisma.purchaseOrderClosure,
    await missing(
      rows.purchaseOrderClosures,
      prisma.purchaseOrderClosure.findMany({ select: { id: true } }),
    ),
  );
  await insertChunks(prisma.pushDevice, rows.pushDevices);
  await insertChunks(prisma.auditLog, rows.auditLog);
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
