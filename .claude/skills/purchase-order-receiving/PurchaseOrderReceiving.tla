----------------------- MODULE PurchaseOrderReceiving -----------------------
(***************************************************************************)
(* Goods receipts and the closure of ONE purchase order under concurrency. *)
(*                                                                         *)
(* Each process is one HTTP request, so one TenantDb.run transaction       *)
(* (apps/api/src/tenancy/tenant-db.service.ts:207) at Postgres's default    *)
(* READ COMMITTED isolation. A Receipt runs GoodsReceiptsService.create and *)
(* a Closer runs GoodsReceiptsService.close                                 *)
(* (apps/api/src/purchase-orders/goods-receipts.service.ts:82 and :155).    *)
(*                                                                         *)
(* One action is one indivisible step of the real system: one SQL          *)
(* statement's read, one advisory lock acquisition, one commit. Triggers   *)
(* are plpgsql VOLATILE functions, so each SELECT inside them takes a      *)
(* fresh snapshot of committed rows plus the transaction's own rows.       *)
(* Rows another transaction has not committed are invisible. A RAISE       *)
(* aborts the whole transaction, which drops its rows and its lock.        *)
(*                                                                         *)
(* Migration paths below are relative to                                   *)
(* apps/api/prisma/migrations/20261010130551_goods_receipts/migration.sql   *)
(* and written as "migration.sql:<line>".                                   *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Ordered,     \* purchase_order_lines.quantity by position, e.g. <<2, 1>>
    Quantities,  \* goods_receipt_lines.quantity values a line entry may carry
    Receipts,    \* concurrent create requests on this order
    Closers,     \* concurrent close requests on this order
    None         \* "no transaction holds the advisory lock"

\* Switches. The real code is all TRUE. AppPrecheck = FALSE is the
\* triggers-only run; each other FALSE is a broken variant that
\* run.sh --broken checks TLC can catch.
CONSTANTS
    AppPrecheck,           \* goods-receipts.service.ts:89-112 and :161-169 run
    LineGuardLocks,        \* migration.sql:183 PERFORM pg_advisory_xact_lock
    ClosureGuardLocks,     \* migration.sql:208 PERFORM pg_advisory_xact_lock
    LineGuardChecksClosed, \* migration.sql:184-186 closed check
    GuardReadsAfterLock    \* trigger SELECTs see rows committed before the
                           \* lock was granted (VOLATILE, fresh snapshot); FALSE
                           \* reads on the INSERT statement's start snapshot

Procs == Receipts \cup Closers
Lines == DOMAIN Ordered   \* the order's purchase_order_lines

Symmetry == Permutations(Receipts) \cup Permutations(Closers)

\* A receipt's input lines in request order. parseCreateGoodsReceipt
\* (goods-receipt-input.ts:287) and the unique index
\* goods_receipt_lines_goods_receipt_id_purchase_order_line_id_key
\* (migration.sql:69) allow each order line at most once per receipt.
Entries == Lines \X Quantities
Plans == { s \in UNION { [1..n -> Entries] : n \in 1..Cardinality(Lines) } :
              \A i, j \in DOMAIN s : i # j => s[i][1] # s[j][1] }

VARIABLES
    pc,          \* where each request is
    plan,        \* Receipts -> the receipt's lines (fixed per request)
    row,         \* Receipts -> index of the createMany row being inserted
    written,     \* Receipts -> rows this transaction inserted, uncommitted
    received,    \* Receipts -> the guard's local `received` for this row
    lockHolder,  \* holder of pg_advisory_xact_lock(hashtextextended(po id))
    snap,        \* Procs -> committed set at the INSERT statement's start
    commitSeq,   \* Procs -> 0, or the position of this commit in commit order
    seq          \* number of commits so far

vars == <<pc, plan, row, written, received, lockHolder, snap, commitSeq, seq>>

-----------------------------------------------------------------------------
(* Reading the database. A view is the set of committed transactions a     *)
(* snapshot sees.                                                          *)

Committed == { p \in Procs : commitSeq[p] # 0 }

RECURSIVE LineQty(_, _, _)
\* Sum of goods_receipt_lines.quantity on order line l among entries 1..n of s.
LineQty(s, n, l) ==
    IF n = 0 THEN 0
    ELSE (IF s[n][1] = l THEN s[n][2] ELSE 0) + LineQty(s, n - 1, l)

RECURSIVE NetOver(_, _)
NetOver(T, l) ==
    IF T = {} THEN 0
    ELSE LET r == CHOOSE x \in T : TRUE
         IN  LineQty(plan[r], Len(plan[r]), l) + NetOver(T \ {r}, l)

\* COALESCE(sum(quantity), 0) over the committed goods_receipt_lines in view V.
NetIn(V, l) == NetOver(V \cap Receipts, l)
\* EXISTS (SELECT 1 FROM purchase_order_closures ...) in view V.
ClosedIn(V) == V \cap Closers # {}
FullIn(V) == \A l \in Lines : NetIn(V, l) = Ordered[l]

\* What a SELECT inside a trigger sees.
GuardView(p) == IF GuardReadsAfterLock THEN Committed ELSE snap[p]

\* The statement's snapshot, kept only when a variant reads on it.
TakeSnap(p) == snap' = IF GuardReadsAfterLock THEN snap
                       ELSE [snap EXCEPT ![p] = Committed]

\* Where a request goes when its INSERT statement starts. Taking the snapshot
\* is a separate step only when a guard reads on it; otherwise the start
\* touches nothing shared, so it is folded into the next step.
StmtStart(stmt, next) == IF GuardReadsAfterLock THEN next ELSE stmt

\* A closer holding an uncommitted purchase_order_closures row.
PendingClosure(c) == pc[c] = "cCommit"

Line(r) == plan[r][row[r]][1]
Qty(r)  == plan[r][row[r]][2]

Abort(p) ==
    /\ pc' = [pc EXCEPT ![p] = "aborted"]
    /\ lockHolder' = IF lockHolder = p THEN None ELSE lockHolder
    /\ UNCHANGED <<commitSeq, seq>>

Commit(p) ==
    /\ pc' = [pc EXCEPT ![p] = "committed"]
    /\ seq' = seq + 1
    /\ commitSeq' = [commitSeq EXCEPT ![p] = seq + 1]
    /\ lockHolder' = IF lockHolder = p THEN None ELSE lockHolder

-----------------------------------------------------------------------------
Init ==
    /\ pc = [p \in Procs |-> IF p \in Receipts THEN "rPrecheck" ELSE "cPrecheck"]
    /\ plan \in [Receipts -> Plans]
    /\ row = [r \in Receipts |-> 1]
    /\ written = [r \in Receipts |-> 0]
    /\ received = [r \in Receipts |-> 0]
    /\ lockHolder = None
    /\ snap = [p \in Procs |-> {}]
    /\ commitSeq = [p \in Procs |-> 0]
    /\ seq = 0

-----------------------------------------------------------------------------
(* GoodsReceiptsService.create                                             *)

\* goods-receipts.service.ts:89-112. this.orders.get reads the committed
\* order, then refuses a CLOSED order (:90) and any line whose net would leave
\* [0, ordered] (:101-111). Taken as one read; it only turns requests away
\* early, so the triggers-only run (AppPrecheck = FALSE) covers any split.
RPrecheck(r) ==
    /\ pc[r] = "rPrecheck"
    /\ IF AppPrecheck
          /\ \/ ClosedIn(Committed)
             \/ \E i \in DOMAIN plan[r] :
                   LET net == NetIn(Committed, plan[r][i][1]) + plan[r][i][2]
                   IN  net > Ordered[plan[r][i][1]] \/ net < 0
       THEN Abort(r)
       ELSE /\ pc' = [pc EXCEPT ![r] = "rInsertReceipt"]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* goods-receipts.service.ts:113 tx.goodsReceipt.create. RLS policy
\* goods_receipts_buyer_insert (migration.sql:121-131) checks NOT EXISTS a
\* closure (:127) on this statement's snapshot, with no lock.
RInsertReceipt(r) ==
    /\ pc[r] = "rInsertReceipt"
    /\ IF ClosedIn(Committed)
       THEN Abort(r)
       ELSE /\ pc' = [pc EXCEPT ![r] = StmtStart("rLinesStmt", "rLock")]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* goods-receipts.service.ts:120 tx.goodsReceiptLine.createMany: one INSERT
\* statement starts and takes its snapshot.
RLinesStmt(r) ==
    /\ pc[r] = "rLinesStmt"
    /\ pc' = [pc EXCEPT ![r] = "rLock"]
    /\ TakeSnap(r)
    /\ UNCHANGED <<plan, row, written, received, lockHolder, commitSeq, seq>>

\* migration.sql:183, once per row (BEFORE INSERT FOR EACH ROW, :201-202).
\* Waits while another transaction holds the lock; re-entrant for its holder.
RLock(r) ==
    /\ pc[r] = "rLock"
    /\ IF LineGuardLocks
       THEN /\ lockHolder \in {None, r}
            /\ lockHolder' = r
       ELSE UNCHANGED lockHolder
    /\ pc' = [pc EXCEPT ![r] = "rClosedCheck"]
    /\ UNCHANGED <<plan, row, written, received, snap, commitSeq, seq>>

\* migration.sql:184-186 IF EXISTS closure THEN RAISE 'purchase order is closed'.
RClosedCheck(r) ==
    /\ pc[r] = "rClosedCheck"
    /\ IF LineGuardChecksClosed /\ ClosedIn(GuardView(r))
       THEN Abort(r)
       ELSE /\ pc' = [pc EXCEPT ![r] = "rReadReceived"]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* migration.sql:188-189 SELECT COALESCE(sum(quantity), 0) INTO received.
\* Sees committed lines plus this transaction's rows already inserted
\* (earlier rows of the same createMany included). The read of `ordered` at
\* :187 is folded in: purchase_order_lines never change, so it commutes.
RReadReceived(r) ==
    /\ pc[r] = "rReadReceived"
    /\ received' = [received EXCEPT ![r] =
          NetIn(GuardView(r), Line(r)) + LineQty(plan[r], written[r], Line(r))]
    /\ pc' = [pc EXCEPT ![r] = "rCheck"]
    /\ UNCHANGED <<plan, row, written, lockHolder, snap, commitSeq, seq>>

\* migration.sql:190-197 RAISE 'over-receiving' / 'cannot correct below zero',
\* else RETURN NEW (:198) and the row is inserted, visible only to r. The
\* local `received` is dead afterwards; clearing it merges equal states.
RCheck(r) ==
    /\ pc[r] = "rCheck"
    /\ received' = [received EXCEPT ![r] = 0]
    /\ LET net == received[r] + Qty(r) IN
       IF net > Ordered[Line(r)] \/ net < 0
       THEN /\ Abort(r)
            /\ UNCHANGED <<row, written>>
       ELSE /\ written' = [written EXCEPT ![r] = row[r]]
            /\ IF row[r] < Len(plan[r])
               THEN /\ row' = [row EXCEPT ![r] = row[r] + 1]
                    /\ pc' = [pc EXCEPT ![r] = "rLock"]
               ELSE /\ pc' = [pc EXCEPT ![r] = "rCommit"]
                    /\ UNCHANGED row
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, snap>>

\* goods-receipts.service.ts:130-151 (re-read, writeAudit, findUnique) only
\* read or write other tables, then TenantDb.run commits; the commit releases
\* the advisory lock.
RCommit(r) ==
    /\ pc[r] = "rCommit"
    /\ Commit(r)
    /\ UNCHANGED <<plan, row, written, received, snap>>

-----------------------------------------------------------------------------
(* GoodsReceiptsService.close                                              *)

\* goods-receipts.service.ts:161-169: refuse unless the committed order is
\* FULLY_RECEIVED and not CLOSED (purchase-order-status.ts statusOf).
CPrecheck(c) ==
    /\ pc[c] = "cPrecheck"
    /\ IF AppPrecheck /\ (ClosedIn(Committed) \/ ~FullIn(Committed))
       THEN Abort(c)
       ELSE /\ pc' = [pc EXCEPT ![c] = StmtStart("cStmt", "cLock")]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* goods-receipts.service.ts:170 tx.purchaseOrderClosure.createMany: the
\* INSERT starts and takes its snapshot.
CStmt(c) ==
    /\ pc[c] = "cStmt"
    /\ pc' = [pc EXCEPT ![c] = "cLock"]
    /\ TakeSnap(c)
    /\ UNCHANGED <<plan, row, written, received, lockHolder, commitSeq, seq>>

\* migration.sql:208 PERFORM pg_advisory_xact_lock.
CLock(c) ==
    /\ pc[c] = "cLock"
    /\ IF ClosureGuardLocks
       THEN /\ lockHolder = None
            /\ lockHolder' = c
       ELSE UNCHANGED lockHolder
    /\ pc' = [pc EXCEPT ![c] = "cReadSums"]
    /\ UNCHANGED <<plan, row, written, received, snap, commitSeq, seq>>

\* migration.sql:209-216 one SELECT: any line whose quantity differs from its
\* summed goods_receipt_lines raises 'purchase order is not fully received'.
CReadSums(c) ==
    /\ pc[c] = "cReadSums"
    /\ IF ~FullIn(GuardView(c))
       THEN Abort(c)
       ELSE /\ pc' = [pc EXCEPT ![c] = "cInsert"]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* The row goes into unique index purchase_order_closures_purchase_order_id_key
\* (migration.sql:75): a committed closure is a unique violation (abort); an
\* uncommitted one makes this insert wait for that transaction to end.
CInsert(c) ==
    /\ pc[c] = "cInsert"
    /\ ~\E d \in Closers \ {c} : PendingClosure(d)
    /\ IF ClosedIn(Committed)
       THEN Abort(c)
       ELSE /\ pc' = [pc EXCEPT ![c] = "cCommit"]
            /\ UNCHANGED <<lockHolder, commitSeq, seq>>
    /\ UNCHANGED <<plan, row, written, received, snap>>

\* goods-receipts.service.ts:179-185 writeAudit and a re-read, then commit.
CCommit(c) ==
    /\ pc[c] = "cCommit"
    /\ Commit(c)
    /\ UNCHANGED <<plan, row, written, received, snap>>

-----------------------------------------------------------------------------
Done == \A p \in Procs : pc[p] \in {"committed", "aborted"}

Next ==
    \/ \E r \in Receipts :
          \/ RPrecheck(r) \/ RInsertReceipt(r) \/ RLinesStmt(r) \/ RLock(r)
          \/ RClosedCheck(r) \/ RReadReceived(r) \/ RCheck(r) \/ RCommit(r)
    \/ \E c \in Closers :
          \/ CPrecheck(c) \/ CStmt(c) \/ CLock(c) \/ CReadSums(c)
          \/ CInsert(c) \/ CCommit(c)
    \/ (Done /\ UNCHANGED vars)   \* every request finished; not a deadlock

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* The property. Checked in every reachable state.                          *)

\* Committed state as of the k-th commit.
CommittedBy(k) == { p \in Procs : commitSeq[p] # 0 /\ commitSeq[p] <= k }
ClosureSeq == IF ClosedIn(Committed)
              THEN commitSeq[CHOOSE c \in Closers : commitSeq[c] # 0]
              ELSE 0

\* Every order line's committed net received quantity is within [0, ordered].
NetReceivedWithinOrdered ==
    \A l \in Lines : 0 <= NetIn(Committed, l) /\ NetIn(Committed, l) <= Ordered[l]

\* No goods receipt line commits after the order's closure committed.
NoReceiptAfterClosure ==
    \A r \in Receipts \cap Committed : ClosureSeq = 0 \/ commitSeq[r] < ClosureSeq

\* When the closure committed, every line's net received equaled its ordered
\* quantity.
ClosedOnlyWhenFullyReceived ==
    ClosureSeq # 0 => FullIn(CommittedBy(ClosureSeq))

\* At most one closure (the unique index), so ClosureSeq is well defined.
AtMostOneClosure == Cardinality(Closers \cap Committed) <= 1

TypeOK ==
    /\ lockHolder \in Procs \cup {None}
    /\ seq \in 0..Cardinality(Procs)

=============================================================================
