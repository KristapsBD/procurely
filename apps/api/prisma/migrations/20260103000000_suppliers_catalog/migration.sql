-- Suppliers and catalog items with agreed prices.
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table          select             insert / update / delete
--   suppliers      any active member  buyer or admin: insert, update name/active; never delete
--                                     (deactivate instead, so history keeps its supplier)
--   catalog_items  any active member  buyer or admin: insert, update, delete
--
-- A catalog item's supplier must belong to the same company: the foreign key covers
-- (company_id, supplier_id), so an item can never point at another company's supplier.

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_id_key" ON "suppliers"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_company_id_supplier_id_name_key" ON "catalog_items"("company_id", "supplier_id", "name");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_company_id_supplier_id_fkey" FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Prices are never negative.
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_unit_price_minor_check
  CHECK (unit_price_minor >= 0);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items FORCE ROW LEVEL SECURITY;

-- suppliers: every active member reads (a catalog item names its supplier), buyers and admins
-- add, rename, deactivate and reactivate. Only name and active are updatable, so a supplier
-- cannot be moved to another company. No delete grant and no delete policy.
GRANT SELECT, INSERT ON suppliers TO procurely_api;
GRANT UPDATE (name, active) ON suppliers TO procurely_api;

CREATE POLICY suppliers_member_select ON suppliers FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IS NOT NULL
  );

CREATE POLICY suppliers_purchasing_insert ON suppliers FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
  );

CREATE POLICY suppliers_purchasing_update ON suppliers FOR UPDATE
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
  );

-- catalog_items: every active member reads (requesters pick from the catalog), buyers and
-- admins write. company_id is not updatable, so an item cannot be moved to another company.
GRANT SELECT, INSERT, DELETE ON catalog_items TO procurely_api;
GRANT UPDATE (supplier_id, name, unit_price_minor) ON catalog_items TO procurely_api;

CREATE POLICY catalog_items_member_select ON catalog_items FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IS NOT NULL
  );

CREATE POLICY catalog_items_purchasing_write ON catalog_items FOR ALL
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
  );
