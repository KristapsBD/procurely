-- Approval rules and approver decisions.
--
-- Role matrix (an "active member" holds an active membership in the current company):
--   table                  select                                insert / update / delete
--   approval_rules         any active member (submitting         admin: insert and delete; never
--                          evaluates them)                       update (a change is delete + create)
--   requisitions           as before, and an approver reads      as before, and an approver or admin
--                          their own, the submitted ones routed  updates status and decision note of
--                          to approvers, and the ones they       a submitted requisition of someone
--                          decided                               else that their role may decide
--   requisition_decisions  the person who decided; admins all    approver or admin, as themselves, on
--                                                                a submitted requisition of someone
--                                                                else they may decide; never update
--                                                                or delete
--
-- On submit the API's requisition lifecycle module evaluates the rules and stores the outcome as
-- the requisition's approval_route, so who decides it does not change when the rules do. The
-- applicable rule is the one with the greatest threshold at or below the total. The status guard
-- trigger recomputes the route with approval_route_for() and refuses one that does not match.

-- CreateEnum
CREATE TYPE "ApproverRole" AS ENUM ('APPROVER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApprovalRoute" AS ENUM ('APPROVER', 'ADMIN', 'UNDER_THRESHOLD', 'NO_RULES');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "requisitions" ADD COLUMN "approval_route" "ApprovalRoute",
ADD COLUMN "decision_note" TEXT;

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "threshold_minor" INTEGER NOT NULL,
    "required_role" "ApproverRole" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "actor_person_id" UUID NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisition_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_rules_company_id_threshold_minor_key" ON "approval_rules"("company_id", "threshold_minor");

-- CreateIndex
CREATE UNIQUE INDEX "requisition_decisions_requisition_id_key" ON "requisition_decisions"("requisition_id");

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_decisions" ADD CONSTRAINT "requisition_decisions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_decisions" ADD CONSTRAINT "requisition_decisions_company_id_requisition_id_fkey" FOREIGN KEY ("company_id", "requisition_id") REFERENCES "requisitions"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_decisions" ADD CONSTRAINT "requisition_decisions_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE approval_rules ADD CONSTRAINT approval_rules_threshold_minor_check
  CHECK (threshold_minor >= 0);

ALTER TABLE requisition_decisions ADD CONSTRAINT requisition_decisions_reject_reason_check
  CHECK (outcome <> 'REJECTED' OR btrim(coalesce(comment, '')) <> '');

-- An approved or rejected requisition is as complete as a submitted one.
ALTER TABLE requisitions DROP CONSTRAINT requisitions_submitted_complete_check;
ALTER TABLE requisitions ADD CONSTRAINT requisitions_submitted_complete_check
  CHECK (
    status IN ('DRAFT', 'CANCELLED')
    OR (cost_center_id IS NOT NULL AND btrim(justification) <> '')
  );

-- A route exists exactly once the requisition left DRAFT; only an approval skips the decider.
ALTER TABLE requisitions ADD CONSTRAINT requisitions_approval_route_check
  CHECK (
    CASE status
      WHEN 'DRAFT' THEN approval_route IS NULL
      WHEN 'APPROVED' THEN approval_route IS NOT NULL
      WHEN 'CANCELLED' THEN approval_route IS DISTINCT FROM 'UNDER_THRESHOLD'
      ELSE approval_route IS NOT NULL AND approval_route <> 'UNDER_THRESHOLD'
    END
  );

ALTER TABLE requisitions ADD CONSTRAINT requisitions_decision_note_check
  CHECK (
    (status <> 'REJECTED' OR btrim(coalesce(decision_note, '')) <> '')
    AND (approval_route IS DISTINCT FROM 'UNDER_THRESHOLD' OR decision_note IS NOT NULL)
  );

ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE requisition_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisition_decisions FORCE ROW LEVEL SECURITY;

-- approval_rules: every active member reads, because a requester's submit evaluates them inside
-- their own transaction. Only admins add and remove. No update grant.
GRANT SELECT, INSERT, DELETE ON approval_rules TO procurely_api;

CREATE POLICY approval_rules_member_select ON approval_rules FOR SELECT
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) IS NOT NULL
  );

CREATE POLICY approval_rules_admin_insert ON approval_rules FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

CREATE POLICY approval_rules_admin_delete ON approval_rules FOR DELETE
  USING (
    company_id = current_company_id()
    AND active_role_in(company_id) = 'ADMIN'
  );

-- The route of a requisition of this total: the role of the rule with the greatest threshold at
-- or below it (inclusive), UNDER_THRESHOLD below every rule, NO_RULES when there are none.
CREATE FUNCTION approval_route_for(p_company uuid, p_total bigint) RETURNS "ApprovalRoute"
  LANGUAGE sql STABLE
  AS $$
    SELECT (CASE
      WHEN NOT EXISTS (SELECT 1 FROM approval_rules WHERE company_id = p_company) THEN 'NO_RULES'
      ELSE coalesce(
        (SELECT required_role::text FROM approval_rules
          WHERE company_id = p_company AND threshold_minor <= p_total
          ORDER BY threshold_minor DESC LIMIT 1),
        'UNDER_THRESHOLD')
    END)::"ApprovalRoute"
  $$;

GRANT EXECUTE ON FUNCTION approval_route_for(uuid, bigint) TO procurely_api;

-- requisition_decisions: visible to the person who decided and to admins. The select policy
-- does not look at requisitions, because the requisitions select policy looks at this table.
GRANT SELECT, INSERT ON requisition_decisions TO procurely_api;

CREATE POLICY requisition_decisions_decider_or_admin_select ON requisition_decisions FOR SELECT
  USING (
    company_id = current_company_id()
    AND (
      active_role_in(company_id) = 'ADMIN'
      OR (
        active_role_in(company_id) IS NOT NULL
        AND actor_person_id = current_person_id()
      )
    )
  );

CREATE POLICY requisition_decisions_decider_insert ON requisition_decisions FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND actor_person_id = current_person_id()
    AND EXISTS (
      SELECT 1 FROM requisitions r
      WHERE r.id = requisition_decisions.requisition_id
        AND r.status = 'SUBMITTED'
        AND r.requester_person_id <> current_person_id()
        AND (
          active_role_in(r.company_id) = 'ADMIN'
          OR (active_role_in(r.company_id) = 'APPROVER' AND r.approval_route = 'APPROVER')
        )
    )
  );

-- requisitions: a new row is always a plain draft; the route and the note come with a status change.
DROP POLICY requisitions_own_insert ON requisitions;
CREATE POLICY requisitions_own_insert ON requisitions FOR INSERT
  WITH CHECK (
    company_id = current_company_id()
    AND requester_person_id = current_person_id()
    AND active_role_in(company_id) IN ('REQUESTER', 'ADMIN')
    AND status = 'DRAFT'
    AND approval_route IS NULL
    AND decision_note IS NULL
  );

-- An approver reads their own requisitions, the submitted ones an approver may decide, and the
-- ones they decided (so a decision can be read back). Admins still read every one, requesters
-- their own, buyers none.
DROP POLICY requisitions_requester_or_admin_select ON requisitions;
CREATE POLICY requisitions_visible_select ON requisitions FOR SELECT
  USING (
    company_id = current_company_id()
    AND (
      active_role_in(company_id) = 'ADMIN'
      OR (
        active_role_in(company_id) IN ('REQUESTER', 'APPROVER')
        AND requester_person_id = current_person_id()
      )
      OR (
        active_role_in(company_id) = 'APPROVER'
        AND (
          (status = 'SUBMITTED' AND approval_route = 'APPROVER')
          OR EXISTS (
            SELECT 1 FROM requisition_decisions d
            WHERE d.requisition_id = requisitions.id
              AND d.actor_person_id = current_person_id()
          )
        )
      )
    )
  );

GRANT UPDATE (approval_route, decision_note) ON requisitions TO procurely_api;

-- A decider changes someone else's submitted requisition: an admin any, an approver one routed to
-- approvers. The status guard keeps their update to the status and the note.
CREATE POLICY requisitions_decider_update ON requisitions FOR UPDATE
  USING (
    company_id = current_company_id()
    AND status = 'SUBMITTED'
    AND requester_person_id <> current_person_id()
    AND (
      active_role_in(company_id) = 'ADMIN'
      OR (active_role_in(company_id) = 'APPROVER' AND approval_route = 'APPROVER')
    )
  )
  WITH CHECK (
    company_id = current_company_id()
    AND status IN ('APPROVED', 'REJECTED')
    AND requester_person_id <> current_person_id()
  );

-- people: whoever reads a requisition reads its requester's name.
CREATE POLICY people_requisition_requester ON people FOR SELECT
  USING (EXISTS (SELECT 1 FROM requisitions r WHERE r.requester_person_id = people.id));

-- Every status change the lifecycle allows, and nothing else. Approved, rejected and cancelled
-- are final. Leaving DRAFT fixes the route, which must match the company's rules; a decision
-- needs the decider's own decision row with the same outcome and note, and changes nothing else.
CREATE FUNCTION requisitions_guard_status() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NEW.status = OLD.status
     OR (OLD.status IN ('DRAFT', 'SUBMITTED') AND NEW.status = 'CANCELLED') THEN
    IF NEW.approval_route IS DISTINCT FROM OLD.approval_route
       OR NEW.decision_note IS DISTINCT FROM OLD.decision_note THEN
      RAISE EXCEPTION 'requisition: the route and the decision note change only on submit or decision'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'DRAFT' AND NEW.status IN ('SUBMITTED', 'APPROVED') THEN
    IF NEW.approval_route IS DISTINCT FROM approval_route_for(
         NEW.company_id,
         (SELECT coalesce(sum(amount_minor), 0) FROM requisition_lines
           WHERE requisition_id = NEW.id))
       OR (NEW.status = 'APPROVED') <> (NEW.approval_route = 'UNDER_THRESHOLD') THEN
      RAISE EXCEPTION 'requisition: the route does not match the company''s approval rules'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'SUBMITTED' AND NEW.status IN ('APPROVED', 'REJECTED') THEN
    IF NEW.approval_route IS DISTINCT FROM OLD.approval_route
       OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NOT EXISTS (
         SELECT 1 FROM requisition_decisions d
         WHERE d.requisition_id = NEW.id
           AND d.actor_person_id = current_person_id()
           AND d.outcome::text = NEW.status::text
           AND d.comment IS NOT DISTINCT FROM NEW.decision_note) THEN
      RAISE EXCEPTION 'requisition: a decision needs the decider''s own decision row and changes nothing else'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'requisition: a % requisition cannot become %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER requisitions_guard_status BEFORE UPDATE ON requisitions
  FOR EACH ROW EXECUTE FUNCTION requisitions_guard_status();
