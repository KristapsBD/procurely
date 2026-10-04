-- Requisitions: a requester asks to buy catalog items, charged to a cost center.
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table              select                               insert / update / delete
--   requisitions       own rows for an active requester     requester or admin, own rows only:
--                      or admin; an admin reads every row   insert as themselves, update cost
--                      of the company; buyers, approvers    center, justification and status;
--                      and other companies see nothing      never delete (cancel instead)
--   requisition_lines  exactly the lines of the             requester or admin, on their own
--                      requisitions the person may read     draft only: insert and delete (an
--                                                           edit replaces the line set); never
--                                                           update
--
-- Which status changes are legal is decided by the API's requisition lifecycle module. The
-- database guarantees the rest: a submitted requisition has a cost center and a justification,
-- a line's amount is its quantity times its unit price, lines change only on a draft, and the
-- cost center, the lines and their catalog items all belong to the requisition's company (the
-- foreign keys cover company_id, as catalog_items -> suppliers does).

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "requester_person_id" UUID NOT NULL,
    "cost_center_id" UUID,
    "justification" TEXT NOT NULL DEFAULT '',
    "status" "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,

    CONSTRAINT "requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_company_id_id_key" ON "cost_centers"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_company_id_id_key" ON "catalog_items"("company_id", "id");

-- CreateIndex
CREATE INDEX "requisitions_company_id_requester_person_id_idx" ON "requisitions"("company_id", "requester_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_company_id_id_key" ON "requisitions"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "requisition_lines_requisition_id_position_key" ON "requisition_lines"("requisition_id", "position");

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requester_person_id_fkey" FOREIGN KEY ("requester_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_company_id_cost_center_id_fkey" FOREIGN KEY ("company_id", "cost_center_id") REFERENCES "cost_centers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_company_id_requisition_id_fkey" FOREIGN KEY ("company_id", "requisition_id") REFERENCES "requisitions"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_company_id_catalog_item_id_fkey" FOREIGN KEY ("company_id", "catalog_item_id") REFERENCES "catalog_items"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE requisitions ADD CONSTRAINT requisitions_submitted_complete_check
  CHECK (status <> 'SUBMITTED' OR (cost_center_id IS NOT NULL AND btrim(justification) <> ''));

ALTER TABLE requisition_lines ADD CONSTRAINT requisition_lines_quantity_check
  CHECK (quantity > 0);

ALTER TABLE requisition_lines ADD CONSTRAINT requisition_lines_unit_price_minor_check
  CHECK (unit_price_minor >= 0);

-- Integer overflow raises instead of wrapping, so an amount too large for the column is refused.
ALTER TABLE requisition_lines ADD CONSTRAINT requisition_lines_amount_minor_check
  CHECK (amount_minor = quantity * unit_price_minor);

ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions FORCE ROW LEVEL SECURITY;
ALTER TABLE requisition_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_lines FORCE ROW LEVEL SECURITY;

-- requisitions: the requester reads and changes their own; an admin reads all of the company's
-- but changes only their own. A requester whose role later changes to buyer or approver no
-- longer sees their old requisitions. Only cost center, justification and status are
-- updatable, so a requisition cannot be moved to another person or company.
GRANT SELECT, INSERT ON requisitions TO procurely_api;
GRANT UPDATE (cost_center_id, justification, status) ON requisitions TO procurely_api;

CREATE POLICY requisitions_requester_or_admin_select ON requisitions FOR SELECT
  USING (
    company_id = current_company_id()
    AND (
      active_role_in(company_id) = 'ADMIN'
      OR (
        active_role_in(company_id) = 'REQUESTER'
        AND requester_person_id = current_person_id()
      )
    )
  );

CREATE POLICY requisitions_own_insert ON requisitions FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND requester_person_id = current_person_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
  );

CREATE POLICY requisitions_own_update ON requisitions FOR UPDATE
  USING (
    company_id = current_company_id()
    AND requester_person_id = current_person_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
  )
  WITH CHECK (
    company_id = current_company_id()
    AND requester_person_id = current_person_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
  );

-- requisition_lines: visibility follows the requisition (the subquery is itself filtered by the
-- requisitions policies). Lines are written only while their requisition is the person's own
-- draft, so a submitted or cancelled requisition keeps the lines it had.
GRANT SELECT, INSERT, DELETE ON requisition_lines TO procurely_api;

CREATE POLICY requisition_lines_select ON requisition_lines FOR SELECT
  USING (
    company_id = current_company_id()
    AND EXISTS (SELECT 1 FROM requisitions r WHERE r.id = requisition_lines.requisition_id)
  );

CREATE POLICY requisition_lines_own_draft_insert ON requisition_lines FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM requisitions r
      WHERE r.id = requisition_lines.requisition_id
        AND r.requester_person_id = current_person_id()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY requisition_lines_own_draft_delete ON requisition_lines FOR DELETE
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM requisitions r
      WHERE r.id = requisition_lines.requisition_id
        AND r.requester_person_id = current_person_id()
        AND r.status = 'DRAFT'
    )
  );
