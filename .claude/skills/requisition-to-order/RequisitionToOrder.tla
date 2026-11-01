------------------------- MODULE RequisitionToOrder -------------------------
(***************************************************************************)
(* ONE requisition from draft to a closed purchase order, under concurrent *)
(* requests.                                                               *)
(*                                                                         *)
(* Each process is one HTTP request, so one TenantDb.run transaction       *)
(* (apps/api/src/tenancy/tenant-db.service.ts:20) at Postgres's default    *)
(* READ COMMITTED isolation. Its requester edits, submits and cancels      *)
(* (RequisitionsService.update and .transition), an approver approves and  *)
(* an admin rejects (RequisitionsService.decide), and two buyers convert   *)
(* it (PurchaseOrdersService.create). Receiving is one coarse step per     *)
(* status; the purchase-order-receiving skill proves its concurrency.      *)
(*                                                                         *)
(* One action is one indivisible step of the real system: one SQL          *)
(* statement, one row lock acquisition, one commit. Rows another           *)
(* transaction has not committed are invisible. A refusal or a database    *)
(* error ends the request and rolls back its rows and its locks.           *)
(*                                                                         *)
(* Paths: "service.ts" is apps/api/src/requisitions/requisitions.service.ts,*)
(* "lifecycle.ts" apps/api/src/requisitions/requisition-lifecycle.ts,      *)
(* "orders.service.ts" apps/api/src/purchase-orders/purchase-orders.service.ts.*)
(* Under apps/api/prisma/migrations, "requisitions.sql" is                 *)
(* 20260105000000_requisitions/migration.sql, "rules.sql"                  *)
(* 20260106000100_approval_rules/migration.sql and "orders.sql"            *)
(* 20261010125659_purchase_orders/migration.sql.                           *)
(***************************************************************************)
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Editors,     \* PUT /requisitions/:id by the requester
    Submitters,  \* POST /requisitions/:id/submit by the requester
    Cancellers,  \* POST /requisitions/:id/cancel by the requester
    Approvers,   \* POST /requisitions/:id/approve by an APPROVER
    Admins,      \* POST /requisitions/:id/reject by an ADMIN
    SelfApprovers, \* POST /requisitions/:id/approve by its own requester
    Buyers,     \* POST /purchase-orders for the requisition by a BUYER
    Nil

\* Switches. The real code is all TRUE. run.sh --broken turns sets of them
\* off and checks that TLC catches each set.
CONSTANTS
    RequisitionLock,     \* service.ts:350 SELECT ... FOR UPDATE
    LifecycleChecks,     \* lifecycle.ts:185-195 decide, :206-214 decideApproval
    StatusGuard,         \* rules.sql:249-291 trigger requisitions_guard_status
    PolicyOwnClause,     \* rules.sql:175, :230, :239 requester <> current person
    PolicyRoleClause,    \* rules.sql:176-179, :211, :231-234 the decider's role
    ConvertCheck,        \* orders.service.ts:151-173 requireConvertible
    OrderApprovedPolicy, \* orders.sql:93-98, :124-127 buyers see and order
                         \* approved requisitions only
    OrderUnique          \* orders.sql:46 purchase_orders_requisition_id_key

RequesterReqs == Editors \cup Submitters \cup Cancellers
Deciders == Approvers \cup Admins \cup SelfApprovers
Procs == RequesterReqs \cup Deciders \cup Buyers

Symmetry == Permutations(Buyers)

\* Line sets by total: "none" has no lines, "small" is under the threshold,
\* "large" at or over it.
LineSets == {"none", "small", "large"}
\* The company's approval rules (approval_rules), fixed during a behavior:
\* none, or one threshold between small and large requiring this role.
RuleSets == {"none", "APPROVER", "ADMIN"}
Final == {"APPROVED", "REJECTED", "CANCELLED"}
\* The purchase order's quantity, received in one or two receipts.
OrderedQuantity == 2

VARIABLES
    pc,          \* where each request is
    owner,       \* requester_person_id: "requester", or "admin" (an admin's own)
    rules,       \* the approval rules
    editLines,   \* the line set the edit request saves
    status,      \* committed requisitions.status
    route,       \* committed requisitions.approval_route
    content,     \* committed justification and line set
    pendingRow,  \* the row lock holder's uncommitted row version, or Nil
    submitTo,    \* Submitters -> [status, route], decided after the lock
    xlock,       \* holder of FOR UPDATE or FOR NO KEY UPDATE on the row, or Nil
    xmode,       \* "forUpdate" or "noKey": the mode xlock holds
    keyShare,    \* holders of FOR KEY SHARE on the row (foreign key checks)
    decPend,     \* deciders holding an uncommitted requisition_decisions row
    decisions,   \* committed requisition_decisions rows: [by, outcome]
    ordPend,     \* buyers holding an uncommitted purchase_orders row
    orders,      \* buyers whose purchase_orders row committed
    received,    \* the order's received quantity (coarse)
    closed,      \* the order has a purchase_order_closures row (coarse)
    leftDraftContent, \* the content committed when the status left DRAFT, or Nil
    firstFinal,  \* the first final status committed, or Nil
    decidedBy    \* who committed SUBMITTED -> APPROVED or REJECTED, or Nil

vars == <<pc, owner, rules, editLines, status, route, content, pendingRow, submitTo,
          xlock, xmode, keyShare, decPend, decisions, ordPend, orders,
          received, closed, leftDraftContent, firstFinal, decidedBy>>

-----------------------------------------------------------------------------
(* Who asks, and what the lifecycle and the policies say about them.        *)

Who(p) == CASE p \in RequesterReqs \cup SelfApprovers -> owner
            [] p \in Approvers -> "approver"
            [] p \in Admins -> "otherAdmin"
            [] p \in Buyers -> "buyer"
\* memberships.role of each person.
RoleOf(w) == CASE w = "requester" -> "REQUESTER"
               [] w = "approver" -> "APPROVER"
               [] w \in {"admin", "otherAdmin"} -> "ADMIN"
               [] w = "buyer" -> "BUYER"
Role(p) == RoleOf(Who(p))
Own(p) == Who(p) = owner
Outcome(p) == IF p \in Admins THEN "REJECTED" ELSE "APPROVED"
Action(p) == CASE p \in Editors -> "edit"
               [] p \in Submitters -> "submit"
               [] p \in Cancellers -> "cancel"
               [] p \in Approvers \cup SelfApprovers -> "approve"
               [] p \in Admins -> "reject"

\* lifecycle.ts:82-93 approvalRequirement and :96-109 routeOf.
RouteFor(lines) ==
    IF rules = "none" THEN "NO_RULES"
    ELSE IF lines = "large" THEN rules ELSE "UNDER_THRESHOLD"

\* lifecycle.ts:44-66 TRANSITIONS.
Allowed(st, act) ==
    \/ st = "DRAFT" /\ act \in {"edit", "submit", "cancel"}
    \/ st = "SUBMITTED" /\ act \in {"cancel", "approve", "reject"}

\* lifecycle.ts:132-162 mayDecide, after its own-requisition check.
MayDecide(rt, role) ==
    CASE rt = "APPROVER" -> role \in {"ADMIN", "APPROVER"}
      [] rt \in {"ADMIN", "NO_RULES"} -> role = "ADMIN"
      [] OTHER -> FALSE

Row == [status |-> status, route |-> route, content |-> content]
\* p's own statements see its uncommitted row version.
RowSeen(p) == IF xlock = p /\ pendingRow # Nil THEN pendingRow ELSE Row

\* SELECT policies on requisitions: rules.sql:199-220 requisitions_visible_select
\* and orders.sql:93-98 requisitions_buyer_approved_select.
Visible(p, r) ==
    CASE Role(p) = "ADMIN" -> TRUE
      [] Role(p) = "REQUESTER" -> Own(p)
      [] Role(p) = "APPROVER" ->
            \/ Own(p)
            \/ r.status = "SUBMITTED" /\ (~PolicyRoleClause \/ r.route = "APPROVER")
            \/ \E dd \in decisions : dd.by = Who(p)
            \/ p \in decPend
      [] Role(p) = "BUYER" -> ~OrderApprovedPolicy \/ r.status = "APPROVED"

\* The decider's role clause in rules.sql:176-179 and :231-234 (and :211 in
\* Visible).
PolicyRole(p, r) ==
    \/ ~PolicyRoleClause
    \/ Role(p) = "ADMIN"
    \/ Role(p) = "APPROVER" /\ r.route = "APPROVER"
PolicyNotOwn(p) == ~PolicyOwnClause \/ ~Own(p)

\* UPDATE policies' USING, which FOR UPDATE also applies:
\* requisitions.sql:124-134 requisitions_own_update and rules.sql:226-240
\* requisitions_decider_update.
UpdateUsing(p, r) ==
    \/ Own(p) /\ Role(p) \in {"REQUESTER", "ADMIN"}
    \/ r.status = "SUBMITTED" /\ PolicyNotOwn(p) /\ PolicyRole(p, r)

\* rules.sql:167-181 requisition_decisions_decider_insert WITH CHECK, on the
\* statement's snapshot. Its subquery is filtered by the SELECT policies.
DecisionPolicy(p, r) ==
    /\ Visible(p, r)
    /\ r.status = "SUBMITTED"
    /\ PolicyNotOwn(p)
    /\ PolicyRole(p, r)

\* rules.sql:249-291 requisitions_guard_status: whether OLD -> NEW may commit.
GuardAllows(p, old, new) ==
    \/ ~StatusGuard
    \/ IF \/ new.status = old.status
          \/ old.status \in {"DRAFT", "SUBMITTED"} /\ new.status = "CANCELLED"
       THEN new.route = old.route
       ELSE IF old.status = "DRAFT" /\ new.status \in {"SUBMITTED", "APPROVED"}
       THEN /\ new.route = RouteFor(new.content.lines)
            /\ (new.status = "APPROVED") = (new.route = "UNDER_THRESHOLD")
       ELSE IF old.status = "SUBMITTED" /\ new.status \in {"APPROVED", "REJECTED"}
       THEN /\ new.route = old.route
            /\ p \in decPend /\ Outcome(p) = new.status
       ELSE FALSE

-----------------------------------------------------------------------------
(* Row locks. A waiter's step is enabled once nothing it conflicts with is  *)
(* held.                                                                   *)

Others(p) == Procs \ {p}
\* FOR UPDATE conflicts with every other row lock.
ForUpdateBlockers(p) == {q \in Others(p) : xlock = q \/ q \in keyShare}
\* FOR NO KEY UPDATE, taken by an UPDATE that changes no key, conflicts with
\* another FOR UPDATE or FOR NO KEY UPDATE, not with FOR KEY SHARE.
UpdateBlockers(p) == {q \in Others(p) : xlock = q}
\* FOR KEY SHARE, taken by the foreign key check of an insert that references
\* the requisition, conflicts only with FOR UPDATE.
KeyShareBlockers(p) == {q \in Others(p) : xlock = q /\ xmode = "forUpdate"}
\* A unique index insert waits for an uncommitted row with the same key.
UniqueBlockers(p) ==
    IF p \in Buyers THEN (IF OrderUnique THEN ordPend \ {p} ELSE {})
    ELSE decPend \ {p}

BlockedBy(p) ==
    CASE pc[p] = "waitLock" -> ForUpdateBlockers(p)
      [] pc[p] = "waitUpdateLock" -> UpdateBlockers(p)
      [] pc[p] = "waitKeyShare" -> KeyShareBlockers(p)
      [] pc[p] = "waitUnique" -> UniqueBlockers(p)
      [] OTHER -> {}

RECURSIVE Reach(_, _)
Reach(S, n) == IF n = 0 THEN S
               ELSE Reach(S \cup UNION {BlockedBy(q) : q \in S}, n - 1)
InCycle(p) == p \in Reach(BlockedBy(p), Cardinality(Procs))

-----------------------------------------------------------------------------
(* Moving a request along.                                                 *)

Unchanged == UNCHANGED <<owner, rules, editLines, received, closed>>

Goto(p, next) ==
    /\ pc' = [pc EXCEPT ![p] = next]
    /\ UNCHANGED <<status, route, content, pendingRow, submitTo, xlock, xmode,
                   keyShare, decPend, decisions, ordPend, orders, leftDraftContent,
                   firstFinal, decidedBy>>

GotoLocked(p, next, locked) ==
    /\ pc' = [pc EXCEPT ![p] = next]
    /\ xlock' = IF locked THEN p ELSE xlock
    /\ xmode' = IF locked THEN "forUpdate" ELSE xmode
    /\ UNCHANGED <<status, route, content, pendingRow, keyShare, decPend,
                   decisions, ordPend, orders, leftDraftContent, firstFinal,
                   decidedBy>>

Release(p) ==
    /\ xlock' = IF xlock = p THEN Nil ELSE xlock
    /\ xmode' = IF xlock = p THEN Nil ELSE xmode
    /\ pendingRow' = IF xlock = p THEN Nil ELSE pendingRow
    /\ keyShare' = keyShare \ {p}
    /\ decPend' = decPend \ {p}
    /\ ordPend' = ordPend \ {p}

\* A service refusal or a database error: the transaction rolls back.
Abort(p, outcome) ==
    /\ pc' = [pc EXCEPT ![p] = outcome]
    /\ Release(p)
    /\ UNCHANGED <<status, route, content, submitTo, decisions, orders,
                   leftDraftContent, firstFinal, decidedBy>>

Commit(p) ==
    LET new == RowSeen(p) IN
    /\ pc' = [pc EXCEPT ![p] = "done"]
    /\ status' = new.status
    /\ route' = new.route
    /\ content' = new.content
    /\ decisions' = IF p \in decPend
                    THEN decisions \cup {[by |-> Who(p), outcome |-> Outcome(p)]}
                    ELSE decisions
    /\ orders' = IF p \in ordPend THEN orders \cup {p} ELSE orders
    /\ leftDraftContent' = IF status = "DRAFT" /\ new.status # "DRAFT"
                    THEN new.content ELSE leftDraftContent
    /\ firstFinal' = IF firstFinal = Nil /\ new.status \in Final
                     THEN new.status ELSE firstFinal
    /\ decidedBy' = IF status = "SUBMITTED" /\ new.status \in {"APPROVED", "REJECTED"}
                    THEN Who(p) ELSE decidedBy
    /\ Release(p)
    /\ UNCHANGED submitTo

\* An UPDATE of the row that passed: its new version is pending, and the
\* request holds the row lock (FOR NO KEY UPDATE unless it held FOR UPDATE).
Updated(p, new, next) ==
    /\ pc' = [pc EXCEPT ![p] = next]
    /\ pendingRow' = new
    /\ xlock' = p
    /\ xmode' = IF xlock = p THEN xmode ELSE "noKey"
    /\ UNCHANGED <<status, route, content, submitTo, keyShare, decPend,
                   decisions, ordPend, orders, leftDraftContent, firstFinal,
                   decidedBy>>

-----------------------------------------------------------------------------
Init ==
    /\ pc = [p \in Procs |-> "start"]
    /\ owner \in {"requester", "admin"}
    /\ rules \in RuleSets
    /\ editLines \in LineSets
    /\ status = "DRAFT"
    /\ route = Nil
    /\ content = [justification |-> "saved", lines |-> "large"]
    /\ pendingRow = Nil
    /\ submitTo = [p \in Submitters |-> Nil]
    /\ xlock = Nil
    /\ xmode = Nil
    /\ keyShare = {}
    /\ decPend = {}
    /\ decisions = {}
    /\ ordPend = {}
    /\ orders = {}
    /\ received = 0
    /\ closed = FALSE
    /\ leftDraftContent = Nil
    /\ firstFinal = Nil
    /\ decidedBy = Nil

-----------------------------------------------------------------------------
(* The requester: update and transition (service.ts:237-300), each through *)
(* loadForChange (:358-380).                                               *)

\* service.ts:366-372 on the row findUnique returns (:351): the rules, the
\* total, then decide (lifecycle.ts:179-196).
RequesterRead(p, r, locked) ==
    LET act == Action(p)
        rt == RouteFor(r.content.lines)
    IN
    IF LifecycleChecks /\ ~Allowed(r.status, act)
    THEN Abort(p, "refusedNotNow")
    ELSE IF LifecycleChecks /\ act = "submit" /\ r.content.lines = "none"
    THEN Abort(p, "refusedIncomplete")
    ELSE /\ GotoLocked(p, "update", locked)
         /\ submitTo' =
              IF act = "submit"
              THEN [submitTo EXCEPT ![p] =
                      [status |-> IF rt = "UNDER_THRESHOLD" THEN "APPROVED"
                                  ELSE "SUBMITTED",
                       route |-> rt]]
              ELSE submitTo

\* service.ts:350 SELECT id FROM requisitions WHERE id = $1 FOR UPDATE.
\* The requester passes requisitions_own_update's USING whatever the status,
\* so the row always qualifies and the request waits for any other lock.
\* The findUnique after it reads under the lock, so it is folded in.
RLock(p) ==
    /\ pc[p] \in {"start", "waitLock"}
    /\ pc[p] = "waitLock" => ForUpdateBlockers(p) = {}
    /\ IF ~RequisitionLock THEN Goto(p, "read")
       ELSE IF ForUpdateBlockers(p) # {} THEN Goto(p, "waitLock")
       ELSE RequesterRead(p, Row, TRUE)
    /\ Unchanged

\* Without the lock: service.ts:351 findUnique on its own snapshot.
RRead(p) ==
    /\ pc[p] = "read"
    /\ RequesterRead(p, Row, FALSE)
    /\ Unchanged

\* service.ts:244 (edit: cost center and justification) or :278 (submit:
\* status and route; cancel: status). The UPDATE row-locks first, then
\* rechecks USING and runs the trigger on the newest committed row.
RUpdate(p) ==
    /\ pc[p] \in {"update", "waitUpdateLock"}
    /\ pc[p] = "waitUpdateLock" => UpdateBlockers(p) = {}
    /\ IF UpdateBlockers(p) # {}
       THEN Goto(p, "waitUpdateLock")
       ELSE LET old == Row
                new == CASE p \in Editors ->
                              [old EXCEPT !.content.justification = "edited"]
                         [] p \in Submitters ->
                              [old EXCEPT !.status = submitTo[p].status,
                                          !.route = submitTo[p].route]
                         [] p \in Cancellers ->
                              [old EXCEPT !.status = "CANCELLED"]
            IN IF ~GuardAllows(p, old, new)
               THEN Abort(p, "failedGuard")
               ELSE Updated(p, new, IF p \in Editors THEN "lines" ELSE "commit")
    /\ Unchanged

\* service.ts:251-252 deleteMany then createMany of the saved lines. Both
\* requisition_lines policies (requisitions.sql:147-169) require a DRAFT on
\* the statement's snapshot, which includes this request's own UPDATE. On a
\* non-draft the delete matches nothing and an insert of any line fails;
\* with no lines saved there is nothing to insert.
RLines(p) ==
    /\ pc[p] = "lines"
    /\ IF RowSeen(p).status = "DRAFT"
       THEN /\ pc' = [pc EXCEPT ![p] = "commit"]
            /\ pendingRow' = [pendingRow EXCEPT !.content.lines = editLines]
            /\ UNCHANGED <<status, route, content, submitTo, xlock, xmode,
                           keyShare, decPend, decisions, ordPend, orders,
                           leftDraftContent, firstFinal, decidedBy>>
       ELSE IF editLines = "none" THEN Goto(p, "commit")
       ELSE Abort(p, "failedPolicy")
    /\ Unchanged

-----------------------------------------------------------------------------
(* The deciders: RequisitionsService.decide (service.ts:303-342).          *)

\* service.ts:311-313 on the row findUnique returns: not visible ends in
\* rejectUnmatchedWrite (404), then decideApproval (lifecycle.ts:199-216).
DeciderRead(p, r, locked) ==
    IF ~Visible(p, r)
    THEN Abort(p, "refusedNotFound")
    ELSE IF LifecycleChecks /\ (~Allowed(r.status, Action(p)) \/ r.route = Nil)
    THEN Abort(p, "refusedNotNow")
    ELSE IF LifecycleChecks /\ Own(p)
    THEN Abort(p, "refusedOwn")
    ELSE IF LifecycleChecks /\ ~MayDecide(r.route, Role(p))
    THEN Abort(p, "refusedNotDecider")
    ELSE /\ GotoLocked(p, "insertDecision", locked)
         /\ UNCHANGED submitTo

\* service.ts:350 FOR UPDATE. RLS filters the row on the statement's
\* snapshot first: a row the decider may not update (an admin on someone
\* else's draft) is skipped without waiting, and nothing is locked. A row
\* that qualifies and is locked makes it wait. Postgres then locks the newest
\* version and rechecks the quals on it; a row that fails is not returned,
\* but the tuple lock stays until the transaction ends.
DLock(p) ==
    LET quals == Visible(p, Row) /\ UpdateUsing(p, Row) IN
    /\ pc[p] \in {"start", "waitLock"}
    /\ pc[p] = "waitLock" => ForUpdateBlockers(p) = {}
    /\ IF ~RequisitionLock \/ (pc[p] = "start" /\ ~quals)
       THEN Goto(p, "read")
       ELSE IF ForUpdateBlockers(p) # {} THEN Goto(p, "waitLock")
       ELSE IF quals THEN DeciderRead(p, Row, TRUE)
       ELSE GotoLocked(p, "read", TRUE) /\ UNCHANGED submitTo
    /\ Unchanged

\* service.ts:351 findUnique, when FOR UPDATE returned no row: a fresh read.
DRead(p) ==
    /\ pc[p] = "read"
    /\ DeciderRead(p, Row, FALSE)
    /\ Unchanged

\* After the unique index admits the row: the foreign key check on
\* requisitions takes FOR KEY SHARE, which waits for another's FOR UPDATE.
KeyShareThen(p, next) ==
    IF KeyShareBlockers(p) # {}
    THEN /\ pc' = [pc EXCEPT ![p] = "waitKeyShare"]
         /\ UNCHANGED keyShare
    ELSE /\ pc' = [pc EXCEPT ![p] = next]
         /\ keyShare' = keyShare \cup {p}

\* The insert's row goes into the unique index, then the foreign key check.
Inserted(p, next) ==
    /\ decPend' = IF p \in Buyers THEN decPend ELSE decPend \cup {p}
    /\ ordPend' = IF p \in Buyers THEN ordPend \cup {p} ELSE ordPend
    /\ KeyShareThen(p, next)
    /\ UNCHANGED <<status, route, content, pendingRow, submitTo, xlock, xmode,
                   decisions, orders, leftDraftContent, firstFinal, decidedBy>>

\* service.ts:315 requisitionDecision.createMany: the policy on this
\* statement's snapshot, then unique index requisition_decisions_requisition_id_key
\* (rules.sql:62), then the foreign key to requisitions (rules.sql:71).
DInsert(p) ==
    /\ pc[p] = "insertDecision"
    /\ IF ~DecisionPolicy(p, RowSeen(p)) THEN Abort(p, "failedPolicy")
       ELSE IF UniqueBlockers(p) # {} THEN Goto(p, "waitUnique")
       ELSE IF decisions # {} THEN Abort(p, "failedUnique")
       ELSE Inserted(p, "update")
    /\ Unchanged

\* service.ts:326 requisition.update. Row-locks, then rechecks the SELECT
\* and UPDATE policies on the newest committed row: none left means Prisma's
\* update finds no record (P2025, 404). Then the trigger.
DUpdate(p) ==
    /\ pc[p] \in {"update", "waitUpdateLock"}
    /\ pc[p] = "waitUpdateLock" => UpdateBlockers(p) = {}
    /\ IF UpdateBlockers(p) # {}
       THEN Goto(p, "waitUpdateLock")
       ELSE LET old == Row
                new == [old EXCEPT !.status = Outcome(p)]
            IN IF ~(Visible(p, old) /\ UpdateUsing(p, old))
               THEN Abort(p, "failedNotFound")
               ELSE IF ~GuardAllows(p, old, new)
               THEN Abort(p, "failedGuard")
               ELSE Updated(p, new, "commit")
    /\ Unchanged

-----------------------------------------------------------------------------
(* The buyers: PurchaseOrdersService.create (orders.service.ts:97-134).    *)

\* orders.service.ts:151-173 requireConvertible: one findUnique of the
\* requisition with its orders. The supplier and line checks that follow
\* read other tables.
BCheck(b) ==
    /\ pc[b] = "start"
    /\ IF ConvertCheck /\ ~Visible(b, Row) THEN Abort(b, "refusedNotFound")
       ELSE IF ConvertCheck /\ status # "APPROVED" THEN Abort(b, "refusedNotNow")
       ELSE IF ConvertCheck /\ orders # {} THEN Abort(b, "refusedConverted")
       ELSE Goto(b, "insertOrder")
    /\ Unchanged

\* orders.service.ts:106 purchaseOrder.create: policy
\* purchase_orders_buyer_insert (orders.sql:119-132) on this statement's
\* snapshot, then unique index purchase_orders_requisition_id_key
\* (orders.sql:46), then the foreign key to requisitions (orders.sql:61).
BInsert(b) ==
    /\ pc[b] = "insertOrder"
    /\ IF OrderApprovedPolicy /\ status # "APPROVED" THEN Abort(b, "failedPolicy")
       ELSE IF UniqueBlockers(b) # {} THEN Goto(b, "waitUnique")
       ELSE IF OrderUnique /\ orders # {} THEN Abort(b, "failedUnique")
       ELSE Inserted(b, "commit")
    /\ Unchanged

-----------------------------------------------------------------------------
(* Waiting on an insert, deadlock, commit.                                 *)

\* The unique index's wait ends when the other transaction does: its row
\* committed (a unique violation, P2002, 409) or rolled back.
UniqueWake(p) ==
    /\ pc[p] = "waitUnique"
    /\ UniqueBlockers(p) = {}
    /\ IF (IF p \in Buyers THEN orders ELSE decisions) # {}
       THEN Abort(p, "failedUnique")
       ELSE Inserted(p, IF p \in Buyers THEN "commit" ELSE "update")
    /\ Unchanged

KeyShareWake(p) ==
    /\ pc[p] = "waitKeyShare"
    /\ KeyShareBlockers(p) = {}
    /\ pc' = [pc EXCEPT ![p] = IF p \in Buyers THEN "commit" ELSE "update"]
    /\ keyShare' = keyShare \cup {p}
    /\ UNCHANGED <<status, route, content, pendingRow, submitTo, xlock, xmode,
                   decPend, decisions, ordPend, orders, leftDraftContent, firstFinal,
                   decidedBy>>
    /\ Unchanged

\* Postgres finds a cycle of waits and aborts one transaction in it
\* (deadlock_detected, 40P01, a 500).
DeadlockAbort(p) ==
    /\ InCycle(p)
    /\ Abort(p, "failedDeadlock")
    /\ Unchanged

\* The rest of the request reads or writes other tables (audit log, order
\* lines, the reread), then TenantDb.run commits.
DoCommit(p) ==
    /\ pc[p] = "commit"
    /\ Commit(p)
    /\ Unchanged

-----------------------------------------------------------------------------
(* Receiving, coarse: purchase-order-status.ts:12-23 statusOf over the     *)
(* order's received quantity and its closure.                              *)

OrderStatus ==
    IF orders = {} THEN Nil
    ELSE IF closed THEN "CLOSED"
    ELSE IF received = OrderedQuantity THEN "FULLY_RECEIVED"
    ELSE IF received > 0 THEN "PARTIALLY_RECEIVED"
    ELSE "ISSUED"

Receive ==
    /\ OrderStatus \in {"ISSUED", "PARTIALLY_RECEIVED"}
    /\ received' \in (received + 1)..OrderedQuantity
    /\ UNCHANGED <<pc, owner, rules, editLines, status, route, content, pendingRow,
                   submitTo, xlock, xmode, keyShare, decPend, decisions,
                   ordPend, orders, closed, leftDraftContent, firstFinal, decidedBy>>

Close ==
    /\ OrderStatus = "FULLY_RECEIVED"
    /\ closed' = TRUE
    /\ UNCHANGED <<pc, owner, rules, editLines, status, route, content, pendingRow,
                   submitTo, xlock, xmode, keyShare, decPend, decisions,
                   ordPend, orders, received, leftDraftContent, firstFinal, decidedBy>>

-----------------------------------------------------------------------------
Terminal == {"done", "refusedNotNow", "refusedIncomplete", "refusedOwn",
             "refusedNotDecider", "refusedNotFound", "refusedConverted",
             "failedGuard", "failedPolicy", "failedNotFound", "failedUnique",
             "failedDeadlock"}
Done == \A p \in Procs : pc[p] \in Terminal

Next ==
    \/ \E p \in RequesterReqs :
          RLock(p) \/ RRead(p) \/ RUpdate(p) \/ RLines(p) \/ DoCommit(p)
    \/ \E p \in Deciders :
          \/ DLock(p) \/ DRead(p) \/ DInsert(p) \/ DUpdate(p)
          \/ UniqueWake(p) \/ KeyShareWake(p) \/ DoCommit(p)
    \/ \E b \in Buyers :
          BCheck(b) \/ BInsert(b) \/ UniqueWake(b) \/ KeyShareWake(b)
          \/ DoCommit(b)
    \/ \E p \in Procs : DeadlockAbort(p)
    \/ Receive \/ Close
    \/ (Done /\ UNCHANGED vars)   \* every request finished; not a deadlock

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The rules. Checked in every reachable state.                            *)

\* A purchase order exists only for an approved requisition.
NoOrderWithoutApproval == orders # {} => status = "APPROVED"

\* A requisition converts once.
AtMostOneOrder == Cardinality(orders) <= 1

\* Nobody approves or rejects their own requisition.
NoSelfDecision ==
    /\ decidedBy # owner
    /\ \A dd \in decisions : dd.by # owner

\* Only the role the requisition's route requires decides it.
DeciderHasRequiredRole ==
    decidedBy # Nil => MayDecide(route, RoleOf(decidedBy))

\* APPROVED, REJECTED and CANCELLED never change.
FinalNeverChanges == firstFinal # Nil => status = firstFinal

\* A cancel and a decision on the same requisition never both commit.
CancelOrDecisionNotBoth ==
    ~(/\ \E x \in Cancellers : pc[x] = "done"
      /\ \E d \in Deciders : pc[d] = "done")

\* A requisition that left DRAFT keeps the content it left with: an edit
\* changes a draft only.
EditOnlyInDraft == status # "DRAFT" => content = leftDraftContent

\* The route is the company's rules applied to the lines it was submitted with.
RouteMatchesRules ==
    /\ route # Nil => leftDraftContent # Nil /\ route = RouteFor(leftDraftContent.lines)
    /\ status \in {"SUBMITTED", "APPROVED", "REJECTED"} => route # Nil

TypeOK ==
    /\ status \in {"DRAFT", "SUBMITTED"} \cup Final
    /\ xlock \in Procs \cup {Nil}
    /\ pendingRow # Nil => xlock # Nil
    /\ keyShare \subseteq Procs

=============================================================================
