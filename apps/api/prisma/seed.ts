import { PrismaClient } from '@prisma/client';
import {
  approvalRules,
  auditLog,
  catalogItems,
  companies,
  costCenters,
  goodsReceipts,
  memberships,
  people,
  pushDevices,
  purchaseOrderClosures,
  purchaseOrders,
  requisitionDecisions,
  requisitions,
  suppliers,
} from './seed-data';

async function seedRequisitions(prisma: PrismaClient) {
  for (const { costCenterCode, lines, ...requisition } of requisitions) {
    const costCenter = await prisma.costCenter.findUniqueOrThrow({
      where: {
        companyId_code: {
          companyId: requisition.companyId,
          code: costCenterCode,
        },
      },
    });
    await prisma.requisition.createMany({
      data: [{ ...requisition, costCenterId: costCenter.id }],
      skipDuplicates: true,
    });
    await prisma.requisitionLine.createMany({
      data: lines.map((line, position) => {
        const item = catalogItems.find((i) => i.id === line.catalogItemId)!;
        return {
          ...line,
          companyId: requisition.companyId,
          requisitionId: requisition.id,
          position,
          unitPriceMinor: item.unitPriceMinor,
          amountMinor: line.quantity * item.unitPriceMinor,
        };
      }),
      skipDuplicates: true,
    });
  }
}

async function seedPurchaseOrders(prisma: PrismaClient) {
  for (const { lines, ...order } of purchaseOrders) {
    await prisma.purchaseOrder.createMany({
      data: [order],
      skipDuplicates: true,
    });
    await prisma.purchaseOrderLine.createMany({
      data: lines.map((line, position) => ({
        ...line,
        companyId: order.companyId,
        purchaseOrderId: order.id,
        position,
        amountMinor: line.quantity * line.unitPriceMinor,
      })),
      skipDuplicates: true,
    });
  }
}

async function seedGoodsReceipts(prisma: PrismaClient) {
  for (const { lines, ...receipt } of goodsReceipts) {
    await prisma.goodsReceipt.createMany({
      data: [receipt],
      skipDuplicates: true,
    });
    for (const { position, ...line } of lines) {
      const orderLine = await prisma.purchaseOrderLine.findFirstOrThrow({
        where: { purchaseOrderId: receipt.purchaseOrderId, position },
      });
      const exists = await prisma.goodsReceiptLine.findFirst({
        where: {
          goodsReceiptId: receipt.id,
          purchaseOrderLineId: orderLine.id,
        },
      });
      if (exists) continue;
      await prisma.goodsReceiptLine.create({
        data: {
          ...line,
          companyId: receipt.companyId,
          goodsReceiptId: receipt.id,
          purchaseOrderId: receipt.purchaseOrderId,
          purchaseOrderLineId: orderLine.id,
        },
      });
    }
  }
  await prisma.purchaseOrderClosure.createMany({
    data: purchaseOrderClosures,
    skipDuplicates: true,
  });
}

// Runs as the database owner (DIRECT_URL): the API role cannot write these tables.
async function main() {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL,
  });
  try {
    await prisma.company.createMany({ data: companies, skipDuplicates: true });
    await prisma.person.createMany({ data: people, skipDuplicates: true });
    await prisma.membership.createMany({
      data: memberships,
      skipDuplicates: true,
    });
    await prisma.costCenter.createMany({
      data: costCenters,
      skipDuplicates: true,
    });
    await prisma.supplier.createMany({ data: suppliers, skipDuplicates: true });
    await prisma.catalogItem.createMany({
      data: catalogItems,
      skipDuplicates: true,
    });
    await seedRequisitions(prisma);
    await prisma.requisitionDecision.createMany({
      data: requisitionDecisions,
      skipDuplicates: true,
    });
    await seedPurchaseOrders(prisma);
    await seedGoodsReceipts(prisma);
    await prisma.approvalRule.createMany({
      data: approvalRules,
      skipDuplicates: true,
    });
    await prisma.pushDevice.createMany({
      data: pushDevices,
      skipDuplicates: true,
    });
    await prisma.auditLog.createMany({ data: auditLog, skipDuplicates: true });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
