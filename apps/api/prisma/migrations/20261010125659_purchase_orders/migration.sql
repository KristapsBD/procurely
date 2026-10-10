-- Purchase orders: a buyer turns an approved requisition into an order for one active supplier.
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table                 select                                  insert / update / delete
--   purchase_orders       buyers and admins: every order of the   buyer or admin, as themselves, for an
--                         company; requesters and approvers:      approved requisition and an active
--                         the orders of the requisitions they     supplier; never update or delete
--                         may read (their own; an approver also
--                         the ones they decided)
--   purchase_order_lines  exactly the lines of the orders the     buyer or admin, in the transaction that
--                         person may read                         created the order; never update or delete
--   requisitions          as before, and a buyer reads every      unchanged
--                         approved requisition of the company
--
-- A requisition converts once: purchase_orders.requisition_id is unique. The API checks the
-- requisition, the supplier and the line items first, for a clear refusal; the policies and
-- constraints below guarantee the rest.

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "catalog_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_requisition_id_key" ON "purchase_orders"("requisition_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_company_id_id_key" ON "purchase_orders"("company_id", "id");

-- CreateIndex
CREATE INDEX "purchase_orders_company_id_created_at_idx" ON "purchase_orders"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_position_key" ON "purchase_order_lines"("purchase_order_id", "position");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_requisition_id_fkey" FOREIGN KEY ("company_id", "requisition_id") REFERENCES "requisitions"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_supplier_id_fkey" FOREIGN KEY ("company_id", "supplier_id") REFERENCES "suppliers"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_company_id_purchase_order_id_fkey" FOREIGN KEY ("company_id", "purchase_order_id") REFERENCES "purchase_orders"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_company_id_catalog_item_id_fkey" FOREIGN KEY ("company_id", "catalog_item_id") REFERENCES "catalog_items"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_quantity_check
  CHECK (quantity > 0);

ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_unit_price_minor_check
  CHECK (unit_price_minor >= 0);

-- Integer overflow raises instead of wrapping, so an amount too large for the column is refused.
ALTER TABLE purchase_order_lines ADD CONSTRAINT purchase_order_lines_amount_minor_check
  CHECK (amount_minor = quantity * unit_price_minor);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines FORCE ROW LEVEL SECURITY;

-- A buyer reads the approved requisitions of the company: they are what a purchase order is made
-- from. Their lines follow through the requisition_lines policy, and the requester's name
-- through people_requisition_requester.
CREATE POLICY requisitions_buyer_approved_select ON requisitions FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'BUYER'
    AND status = 'APPROVED'
  );

-- purchase_orders: buyers and admins read all of the company's. A requester or approver reads
-- the orders of the requisitions they may read (the subquery is itself filtered by the
-- requisitions policies). An order is never changed or deleted.
GRANT SELECT, INSERT ON purchase_orders TO procurely_api;

CREATE POLICY purchase_orders_select ON purchase_orders FOR SELECT
  USING (
    company_id = current_company_id()
    AND (
      active_role_in(company_id) IN ('BUYER', 'ADMIN')
      OR (
        active_role_in(company_id) IN ('REQUESTER', 'APPROVER')
        AND EXISTS (SELECT 1 FROM requisitions r WHERE r.id = purchase_orders.requisition_id)
      )
    )
  );

-- Only a buyer or admin inserts, as themselves, for a requisition they can read that is
-- approved, and for a supplier that is active now. The unique requisition_id allows one order.
CREATE POLICY purchase_orders_buyer_insert ON purchase_orders FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND created_by_person_id = current_person_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM requisitions r
      WHERE r.id = purchase_orders.requisition_id AND r.status = 'APPROVED'
    )
    AND EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = purchase_orders.supplier_id AND s.active
    )
  );

-- purchase_order_lines: visibility follows the order. Lines are written only by the transaction
-- that created their order (the row's xmin is the current transaction id), so an order keeps the
-- lines it had.
GRANT SELECT, INSERT ON purchase_order_lines TO procurely_api;

CREATE POLICY purchase_order_lines_select ON purchase_order_lines FOR SELECT
  USING (
    company_id = current_company_id()
    AND EXISTS (
      SELECT 1 FROM purchase_orders o WHERE o.id = purchase_order_lines.purchase_order_id
    )
  );

CREATE POLICY purchase_order_lines_new_order_insert ON purchase_order_lines FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM purchase_orders o
      WHERE o.id = purchase_order_lines.purchase_order_id
        AND o.created_by_person_id = current_person_id()
        AND o.xmin::text = (txid_current() % 4294967296)::text
    )
  );

-- people: whoever reads a purchase order reads the name of the buyer who made it.
CREATE POLICY people_purchase_order_creator ON people FOR SELECT
  USING (EXISTS (SELECT 1 FROM purchase_orders o WHERE o.created_by_person_id = people.id));
