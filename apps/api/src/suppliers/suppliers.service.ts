import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Supplier as SupplierRow } from '@prisma/client';
import type {
  CreateSupplierRequest,
  Supplier,
  UpdateSupplierRequest,
} from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { PURCHASING_ROLES, rejectUnmatchedWrite } from '../tenancy/roles';

type Tx = Prisma.TransactionClient;

function toSupplier(s: SupplierRow): Supplier {
  return { id: s.id, companyId: s.companyId, name: s.name, active: s.active };
}

/**
 * Supplier management. Every method runs inside the caller's TenantDb.run, so a change and
 * its audit entry share one transaction. Row-level security decides who may do what: every
 * active member reads, buyers and admins write. Suppliers are never deleted, only deactivated.
 */
@Injectable()
export class SuppliersService {
  /** `selectable` keeps only the suppliers that may be chosen for new work (active ones). */
  async list(tx: Tx, selectable: boolean): Promise<Supplier[]> {
    const rows = await tx.supplier.findMany({
      where: selectable ? { active: true } : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toSupplier);
  }

  async get(tx: Tx, id: string): Promise<Supplier> {
    const row = await tx.supplier.findUnique({ where: { id } });
    if (!row) throw new NotFoundException();
    return toSupplier(row);
  }

  async create(
    tx: Tx,
    scope: CompanyRequestScope,
    input: CreateSupplierRequest,
  ): Promise<Supplier> {
    const row = await tx.supplier.create({
      data: { companyId: scope.companyId, name: input.name },
    });
    await writeAudit(tx, scope, {
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: row.id,
      details: { name: row.name },
    });
    return toSupplier(row);
  }

  /** Renames, deactivates or reactivates. One audit entry per kind of change. */
  async update(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    change: UpdateSupplierRequest,
  ): Promise<Supplier> {
    const before = await tx.supplier.findUnique({ where: { id } });
    if (!before) return rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    const after = {
      ...before,
      name: change.name ?? before.name,
      active: change.active ?? before.active,
    };
    // Always written, even when nothing changes, so the database checks the role every time.
    const { count } = await tx.supplier.updateMany({
      where: { id },
      data: { name: after.name, active: after.active },
    });
    if (count === 0) return rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    await this.auditChange(tx, scope, before, after);
    return toSupplier(after);
  }

  private async auditChange(
    tx: Tx,
    scope: CompanyRequestScope,
    before: SupplierRow,
    after: SupplierRow,
  ): Promise<void> {
    const base = { entityType: 'supplier', entityId: before.id };
    if (after.name !== before.name) {
      await writeAudit(tx, scope, {
        ...base,
        action: 'supplier.renamed',
        details: { from: before.name, to: after.name },
      });
    }
    if (after.active !== before.active) {
      await writeAudit(tx, scope, {
        ...base,
        action: after.active ? 'supplier.reactivated' : 'supplier.deactivated',
        details: { name: after.name },
      });
    }
  }
}
