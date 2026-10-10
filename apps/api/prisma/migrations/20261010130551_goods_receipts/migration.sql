-- Goods receipts: a buyer confirms deliveries against purchase order lines, and closes an order
-- once every line is fully received.
--
-- A purchase order's status is derived, never stored (the order itself is immutable):
--   ISSUED              no receipt entries yet, or entries that net to zero on every line
--   PARTIALLY_RECEIVED  some quantity received, at least one line still short
--   FULLY_RECEIVED      every line received exactly as ordered
--   CLOSED              a purchase_order_closures row exists (only a fully received order closes)
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table                  select                          insert (update / delete: never)
--   goods_receipts         exactly the receipts of the     buyer or admin, as themselves, for an
--                          orders the person may read      order they may read that is not closed
--   goods_receipt_lines    follow their receipt            buyer or admin, in the transaction that
--                                                          created the receipt
--   purchase_order_closures follow their order             buyer or admin, as themselves
--
-- A receipt is never edited or deleted. A mistake is corrected by a later receipt line with a
-- negative quantity and a note. Triggers keep the net received quantity of each order line
-- between zero and the ordered quantity, and refuse a receipt on a closed order or a closure of
-- an order that is not fully received; they serialize concurrent writers per order with an
-- advisory transaction lock. They run as the caller, under row-level security.

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "received_by_person_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_closures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "closed_by_person_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchase_order_id_id_key" ON "purchase_order_lines"("purchase_order_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_company_id_purchase_order_id_id_key" ON "goods_receipts"("company_id", "purchase_order_id", "id");

-- CreateIndex
CREATE INDEX "goods_receipts_purchase_order_id_received_at_idx" ON "goods_receipts"("purchase_order_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_goods_receipt_id_purchase_order_line_id_key" ON "goods_receipt_lines"("goods_receipt_id", "purchase_order_line_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchase_order_line_id_idx" ON "goods_receipt_lines"("purchase_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_closures_purchase_order_id_key" ON "purchase_order_closures"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_company_id_purchase_order_id_fkey" FOREIGN KEY ("company_id", "purchase_order_id") REFERENCES "purchase_orders"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_person_id_fkey" FOREIGN KEY ("received_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The receipt belongs to the same company and the same order as the line.
-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_company_id_purchase_order_id_goods_rec_fkey" FOREIGN KEY ("company_id", "purchase_order_id", "goods_receipt_id") REFERENCES "goods_receipts"("company_id", "purchase_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchase_order_id_purchase_order_line__fkey" FOREIGN KEY ("purchase_order_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("purchase_order_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_closures" ADD CONSTRAINT "purchase_order_closures_company_id_purchase_order_id_fkey" FOREIGN KEY ("company_id", "purchase_order_id") REFERENCES "purchase_orders"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_closures" ADD CONSTRAINT "purchase_order_closures_closed_by_person_id_fkey" FOREIGN KEY ("closed_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A positive quantity is a delivery. A negative one corrects an earlier entry and says why.
ALTER TABLE goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_quantity_check
  CHECK (quantity <> 0 AND (quantity > 0 OR (note IS NOT NULL AND length(btrim(note)) > 0)));

ALTER TABLE goods_receipt_lines ADD CONSTRAINT goods_receipt_lines_note_check
  CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 500 AND note = btrim(note)));

ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_closures FORCE ROW LEVEL SECURITY;

-- Receipts are append-only: no update or delete grant, and no policy for either.
GRANT SELECT, INSERT ON goods_receipts TO procurely_api;
GRANT SELECT, INSERT ON goods_receipt_lines TO procurely_api;
GRANT SELECT, INSERT ON purchase_order_closures TO procurely_api;

CREATE POLICY goods_receipts_select ON goods_receipts FOR SELECT
  USING (
    company_id = current_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders o WHERE o.id = goods_receipts.purchase_order_id)
  );

CREATE POLICY goods_receipts_buyer_insert ON goods_receipts FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND received_by_person_id = current_person_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
    AND EXISTS (SELECT 1 FROM purchase_orders o WHERE o.id = goods_receipts.purchase_order_id)
    AND NOT EXISTS (
      SELECT 1 FROM purchase_order_closures c
      WHERE c.purchase_order_id = goods_receipts.purchase_order_id
    )
  );

-- Lines are written only by the transaction that created their receipt (xmin is the current
-- transaction id), so a receipt keeps the lines it had.
CREATE POLICY goods_receipt_lines_select ON goods_receipt_lines FOR SELECT
  USING (
    company_id = current_company_id()
    AND EXISTS (SELECT 1 FROM goods_receipts r WHERE r.id = goods_receipt_lines.goods_receipt_id)
  );

CREATE POLICY goods_receipt_lines_new_receipt_insert ON goods_receipt_lines FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM goods_receipts r
      WHERE r.id = goods_receipt_lines.goods_receipt_id
        AND r.received_by_person_id = current_person_id()
        AND r.xmin::text = (txid_current() % 4294967296)::text
    )
  );

CREATE POLICY purchase_order_closures_select ON purchase_order_closures FOR SELECT
  USING (
    company_id = current_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders o WHERE o.id = purchase_order_closures.purchase_order_id)
  );

CREATE POLICY purchase_order_closures_buyer_insert ON purchase_order_closures FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND closed_by_person_id = current_person_id()
    AND active_role_in(company_id) IN ('BUYER', 'ADMIN')
    AND EXISTS (SELECT 1 FROM purchase_orders o WHERE o.id = purchase_order_closures.purchase_order_id)
  );

-- people: whoever reads a receipt or a closure reads the name of the buyer who made it.
CREATE POLICY people_goods_receipt_receiver ON people FOR SELECT
  USING (EXISTS (SELECT 1 FROM goods_receipts r WHERE r.received_by_person_id = people.id));

CREATE POLICY people_purchase_order_closer ON people FOR SELECT
  USING (EXISTS (SELECT 1 FROM purchase_order_closures c WHERE c.closed_by_person_id = people.id));

-- The net received quantity of a line stays between zero and the ordered quantity, and a closed
-- order takes no more entries. The advisory lock makes two concurrent receipts on one order take
-- turns, so neither can pass the check on stale totals.
CREATE FUNCTION goods_receipt_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ordered integer;
  received bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.purchase_order_id::text, 0));
  IF EXISTS (SELECT 1 FROM purchase_order_closures WHERE purchase_order_id = NEW.purchase_order_id) THEN
    RAISE EXCEPTION 'purchase order is closed' USING ERRCODE = 'P0001', HINT = 'closed';
  END IF;
  SELECT quantity INTO ordered FROM purchase_order_lines WHERE id = NEW.purchase_order_line_id;
  SELECT COALESCE(sum(quantity), 0) INTO received
    FROM goods_receipt_lines WHERE purchase_order_line_id = NEW.purchase_order_line_id;
  IF received + NEW.quantity > ordered THEN
    RAISE EXCEPTION 'over-receiving: % ordered, % already received', ordered, received
      USING ERRCODE = 'P0001', HINT = 'over_received';
  END IF;
  IF received + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'cannot correct below zero: % already received', received
      USING ERRCODE = 'P0001', HINT = 'under_received';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER goods_receipt_lines_guard BEFORE INSERT ON goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION goods_receipt_lines_guard();

-- Only an order whose every line is received exactly as ordered closes.
CREATE FUNCTION purchase_order_closures_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.purchase_order_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM purchase_order_lines l
    WHERE l.purchase_order_id = NEW.purchase_order_id
      AND l.quantity <> COALESCE(
        (SELECT sum(g.quantity) FROM goods_receipt_lines g WHERE g.purchase_order_line_id = l.id), 0)
  ) THEN
    RAISE EXCEPTION 'purchase order is not fully received' USING ERRCODE = 'P0001', HINT = 'not_fully_received';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER purchase_order_closures_guard BEFORE INSERT ON purchase_order_closures
  FOR EACH ROW EXECUTE FUNCTION purchase_order_closures_guard();
