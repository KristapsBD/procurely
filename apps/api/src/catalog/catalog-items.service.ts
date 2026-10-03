import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CatalogItem,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { PURCHASING_ROLES, rejectUnmatchedWrite } from '../tenancy/roles';

type Tx = Prisma.TransactionClient;
type ItemWithSupplier = Prisma.CatalogItemGetPayload<{
  include: { supplier: true };
}>;

const withSupplier = { supplier: true } as const;
const EDITABLE = ['supplierId', 'name', 'unitPriceMinor'] as const;

function toCatalogItem(i: ItemWithSupplier): CatalogItem {
  return {
    id: i.id,
    companyId: i.companyId,
    supplierId: i.supplierId,
    supplierName: i.supplier.name,
    supplierActive: i.supplier.active,
    name: i.name,
    unitPriceMinor: i.unitPriceMinor,
  };
}

/**
 * An inactive supplier cannot be chosen for new work, which includes new catalog entries.
 * FOR SHARE holds the supplier row until the transaction ends, so a concurrent deactivation
 * either commits first (and is seen here) or waits until this write has committed.
 */
async function requireActiveSupplier(
  tx: Tx,
  supplierId: string,
): Promise<void> {
  const [supplier] = await tx.$queryRaw<{ name: string; active: boolean }[]>`
    SELECT name, active FROM suppliers WHERE id = ${supplierId}::uuid FOR SHARE`;
  if (!supplier?.active) {
    throw new ConflictException(
      `Supplier ${supplier?.name ?? supplierId} is inactive and cannot be chosen`,
    );
  }
}

/**
 * Catalog items and their agreed prices. Every method runs inside the caller's TenantDb.run,
 * so a change and its audit entry share one transaction. Row-level security decides who may
 * do what: every active member reads, buyers and admins write. The write comes first, so the
 * database refuses a requester before any business rule is checked; a rule that fails
 * afterwards throws and rolls the write back.
 */
@Injectable()
export class CatalogItemsService {
  /** `selectable` keeps only the items whose supplier is active. */
  async list(tx: Tx, selectable: boolean): Promise<CatalogItem[]> {
    const rows = await tx.catalogItem.findMany({
      where: selectable ? { supplier: { active: true } } : {},
      include: withSupplier,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toCatalogItem);
  }

  async get(tx: Tx, id: string): Promise<CatalogItem> {
    const row = await tx.catalogItem.findUnique({
      where: { id },
      include: withSupplier,
    });
    if (!row) throw new NotFoundException();
    return toCatalogItem(row);
  }

  async create(
    tx: Tx,
    scope: CompanyRequestScope,
    input: CreateCatalogItemRequest,
  ): Promise<CatalogItem> {
    const row = await tx.catalogItem.create({
      data: { ...input, companyId: scope.companyId },
      include: withSupplier,
    });
    await requireActiveSupplier(tx, row.supplierId);
    await writeAudit(tx, scope, {
      action: 'catalog_item.created',
      entityType: 'catalog_item',
      entityId: row.id,
      details: { ...input },
    });
    return toCatalogItem(row);
  }

  /** Changes supplier, name or price. Moving to another supplier requires it to be active. */
  async update(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    change: UpdateCatalogItemRequest,
  ): Promise<CatalogItem> {
    const before = await tx.catalogItem.findUnique({ where: { id } });
    if (!before) return rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    const { count } = await tx.catalogItem.updateMany({
      where: { id },
      data: change,
    });
    if (count === 0) return rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    const after = await tx.catalogItem.findUniqueOrThrow({
      where: { id },
      include: withSupplier,
    });
    if (after.supplierId !== before.supplierId) {
      await requireActiveSupplier(tx, after.supplierId);
    }
    const details = Object.fromEntries(
      EDITABLE.filter((f) => after[f] !== before[f]).map((f) => [
        f,
        { from: before[f], to: after[f] },
      ]),
    );
    if (Object.keys(details).length > 0) {
      await writeAudit(tx, scope, {
        action: 'catalog_item.updated',
        entityType: 'catalog_item',
        entityId: id,
        details,
      });
    }
    return toCatalogItem(after);
  }

  async remove(tx: Tx, scope: CompanyRequestScope, id: string): Promise<void> {
    const before = await tx.catalogItem.findUnique({ where: { id } });
    const { count } = await tx.catalogItem.deleteMany({ where: { id } });
    if (!before || count === 0) {
      return rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    }
    await writeAudit(tx, scope, {
      action: 'catalog_item.deleted',
      entityType: 'catalog_item',
      entityId: id,
      details: {
        name: before.name,
        supplierId: before.supplierId,
        unitPriceMinor: before.unitPriceMinor,
      },
    });
  }
}
