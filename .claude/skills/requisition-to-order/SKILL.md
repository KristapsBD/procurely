---
name: requisition-to-order
description: Model-check the requisition lifecycle (edit, submit, cancel, approve, reject) and its conversion to a purchase order under concurrent requests with TLA+ (TLC in Docker). Use when a change touches RequisitionsService, requisition-lifecycle.ts, PurchaseOrdersService.create, the requisitions, approval_rules or purchase_orders migrations (policies, trigger requisitions_guard_status, unique indexes), or the TenantDb transaction, or when asked whether concurrent requests can approve one's own requisition, change a final status, or order a requisition twice.
---

# Requisition to order

**Property.** For one requisition, under every interleaving of its requests:

- `NoOrderWithoutApproval`: a purchase order exists only for an APPROVED requisition.
- `AtMostOneOrder`: two buyers converting at once make at most one order.
- `NoSelfDecision`: nobody approves or rejects their own requisition.
- `DeciderHasRequiredRole`: only the role the requisition's approval route requires decides it.
- `FinalNeverChanges`: APPROVED, REJECTED and CANCELLED never change.
- `CancelOrDecisionNotBoth`: a cancel and an approve or reject racing on one requisition never both commit.
- `EditOnlyInDraft`: a requisition that left DRAFT keeps the content it left with, so an edit racing a submit cannot change a submitted requisition.
- `RouteMatchesRules`: the approval route is the company's rules applied to the lines the requisition was submitted with.

**Harm if broken.** A requester could approve their own spend, a buyer could order goods nobody approved or order them twice, and a decision could be overwritten after the requester read it.

The model is `RequisitionToOrder.tla` in this directory. It describes the real concurrency design: `SELECT ... FOR UPDATE` on the requisition before every requester and decider change, row-level security filtered on each statement's snapshot, the `requisitions_guard_status` trigger, the unique indexes, the row locks that foreign key checks take, Postgres READ COMMITTED, and one transaction per request. The order's receiving tail (ISSUED, partly and fully received, closed) is one coarse step per status, so a chart shows the whole lifecycle. The `purchase-order-receiving` skill proves receiving under concurrency.

## Run it

From the repo root:

```sh
.claude/skills/requisition-to-order/run.sh
```

Exit 0 means every invariant holds. Any other exit is a failure, and the script prints the violated invariant and the counterexample, one line per step, as `<step>. <request> <action> -> <next label>`, with `status: <new>` when a status commits. The scenario lines first name who owns the requisition, the company's approval rules, and the lines the edit saves. It needs Docker and, on the first run, network. It downloads `tla2tools.jar` v1.7.4 (TLC 2.19, sha256-pinned) into the gitignored `.cache/` and runs it in `eclipse-temurin:21-jre` pinned by digest. The real code is about 330,000 distinct states and takes about 10 seconds.

To prove the check can still fail, run `run.sh --broken`. Each variant turns a set of switches off in `MC.cfg`, checks only the invariant it names, and must end in TLC exit 12 on that invariant. It exits 0 only if every variant is caught. It takes about a minute. Run it after any edit to the model.

Read every result with the `/statechart` skill. It draws a passing run as a chart of how the requests move between states, and it shows each violation as its shortest path in plain words, and which of those violations a change fixes. The `pc` labels are the chart's states: `waitLock`, `waitUpdateLock`, `waitKeyShare` and `waitUnique` are waits, `refused*` are refusals the service gives, and `failed*` are errors the database raises.

## When to use it

Run it when a diff touches anything in the coverage record below. List what changed since the model was last confirmed, committed or not:

```sh
git diff --stat 8d8cee64ad39a34784d50d2fb83221b2ed425571 -- \
  apps/api/src/requisitions/requisitions.service.ts \
  apps/api/src/requisitions/requisition-lifecycle.ts \
  apps/api/src/purchase-orders/purchase-orders.service.ts \
  apps/api/src/purchase-orders/purchase-order-status.ts \
  apps/api/src/tenancy/tenant-db.service.ts \
  apps/api/prisma/migrations/20260105000000_requisitions/migration.sql \
  apps/api/prisma/migrations/20260106000100_approval_rules/migration.sql \
  apps/api/prisma/migrations/20261010125659_purchase_orders/migration.sql
{ git diff --name-only 8d8cee64ad39a34784d50d2fb83221b2ed425571 -- apps/api/prisma/migrations
  git ls-files --others --exclude-standard apps/api/prisma/migrations; } |
  xargs -r grep -lE 'requisition|purchase_orders|approval_route'
```

The second command lists new migrations that mention the covered tables. Any migration that redefines a policy on `requisitions`, `requisition_lines`, `requisition_decisions` or `purchase_orders`, the trigger `requisitions_guard_status`, or the unique indexes counts. So does any new code path that updates `requisitions` or inserts into `requisition_decisions` or `purchase_orders` (`grep -rn 'requisition\.update\|requisitionDecision\.\|purchaseOrder\.create' apps/api/src`).

## Mirror the change into the model first

If you run the model unchanged after a code change, it checks the old code. Before you run, read the diff and change the model the same way.

TypeScript files are under `apps/api/src/requisitions/`, `apps/api/src/purchase-orders/` or `apps/api/src/tenancy/`, and SQL files under `apps/api/prisma/migrations/`. `rules.sql` is `20260106000100_approval_rules/migration.sql`, `requisitions.sql` is `20260105000000_requisitions/migration.sql`, and `orders.sql` is `20261010125659_purchase_orders/migration.sql`.

| Code (at the sync commit)                                                                         | Model                           | Switch in `MC.cfg`                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------- |
| `requisitions.service.ts:350` `FOR UPDATE` in `lock`, requester path                              | `RLock`                         | `RequisitionLock`                      |
| `requisitions.service.ts:351`, `:366-372` read, rules, `decide` (`requisition-lifecycle.ts:179-196`) | `RequesterRead`, `RRead`         | `LifecycleChecks`                      |
| `requisitions.service.ts:244` edit header, `:278` submit or cancel status                        | `RUpdate`                       |                                        |
| `requisitions.service.ts:251-252` edit lines, policies `requisitions.sql:147-169`                 | `RLines`                        |                                        |
| `requisitions.service.ts:350` `FOR UPDATE` in `lock`, decider path                                | `DLock`                         | `RequisitionLock`                      |
| `requisitions.service.ts:311-313` `decideApproval` (`requisition-lifecycle.ts:199-216`)           | `DeciderRead`, `DRead`          | `LifecycleChecks`                      |
| `requisitions.service.ts:315` decision insert, policy `rules.sql:167-181`, unique `rules.sql:62`  | `DInsert`                       | `PolicyOwnClause`, `PolicyRoleClause`  |
| `requisitions.service.ts:326` status update, policies `requisitions.sql:124-134`, `rules.sql:226-240` | `DUpdate`                    | `PolicyOwnClause`, `PolicyRoleClause`  |
| `rules.sql:199-220` `requisitions_visible_select`, `orders.sql:93-98` buyer select                | `Visible`                       | `PolicyRoleClause`, `OrderApprovedPolicy` |
| `rules.sql:249-291` trigger `requisitions_guard_status`                                           | `GuardAllows`                   | `StatusGuard`                          |
| `purchase-orders.service.ts:151-173` `requireConvertible`                                         | `BCheck`                        | `ConvertCheck`                         |
| `purchase-orders.service.ts:106` order insert, policy `orders.sql:119-132`, unique `orders.sql:46` | `BInsert`                      | `OrderApprovedPolicy`, `OrderUnique`   |
| foreign keys `rules.sql:71`, `orders.sql:61` (`FOR KEY SHARE` on the requisition)                 | `KeyShareThen`, `KeyShareWake`  |                                        |
| `purchase-order-status.ts:12-23` `statusOf`                                                       | `OrderStatus`, `Receive`, `Close` |                                      |
| `tenancy/tenant-db.service.ts:20` one transaction, then commit                                    | `DoCommit`                      |                                        |

How to mirror a change:

- If a change removes one of the switched guards, set that switch to `FALSE` in `MC.cfg`. For example, if you delete the `FOR UPDATE` query from `lock`, set `RequisitionLock = FALSE`.
- For any other change to a row of the table, edit that action so it does what the new code does, with one action per indivisible step (one SQL statement, one lock acquisition, one commit). Keep the `file:line` comment above the action current.
- A new writer of `requisitions`, `requisition_decisions` or `purchase_orders`, a new request kind, or a change of isolation level needs a new or changed process. Update the coverage record too.

A switch at `FALSE` describes broken code. It exists so that a change that drops a guard can be mirrored and shown to fail. Set it back to `TRUE` when that change is reverted. `run.sh --broken` flips the switches itself and needs them all `TRUE` in `MC.cfg`. Most rules have two or three guards (the service, a policy, the trigger), so a variant turns off every guard of its rule. `run.sh` lists each variant with the invariant it must break.

## Read a failure

TLC exit 12 is an invariant violation. Read the printed steps against the table and the code:

- **Real bug.** Every step is one the code can take in that order, given READ COMMITTED, the row locks and the policies. Report it as a bug in the code's words. For example: "without the lock, the edit reads the draft, the submit commits, and the edit's header update passes `requisitions_own_update` and the trigger, so a submitted requisition's justification changes." Do not weaken an invariant or the model to make it pass.
- **Modeling error.** A step the code cannot take. For example, a request reads before a lock the code takes first, a policy is checked on the wrong row version, or a mirrored change went into the wrong action. Fix the model and rerun `run.sh --broken` to show the variants still fail.
- **Other exits.** Exit 11 is a deadlock TLC found. Postgres deadlocks are already modeled (`DeadlockAbort` ends one request with `failedDeadlock`), so exit 11 means requests wait for something that never comes, which is a modeling error. Any other exit, or a parse or semantic error in the log, means a broken spec, config or tool run. The full TLC log is at `.cache/<run>.log`.

**Known outcomes that are not violations.** The real code passes every invariant, but it reaches these outcomes, and a chart shows them. A decider's `FOR UPDATE` filters rows by row-level security on its snapshot, and `lock` reads the row again whether or not it locked anything. When the requisition was still a draft the decider may not change, the lock takes nothing, and if the submit commits before the next read, the decider goes on unlocked:

- An approver that goes on unlocked can deadlock with an admin who holds the lock. The approver's decision row waits on the foreign key's `FOR KEY SHARE`, and the admin's decision row waits on the approver's unique index entry. Postgres aborts one with `deadlock_detected`, which reaches the client as a 500 (`failedDeadlock`).
- When the other request commits first, the unlocked decider gets a 409 "Already exists" (`failedUnique`), a 403 "Not allowed in this company" (`failedPolicy`) or a 404 (`failedNotFound`), not the 409 the lifecycle would give.

These are a defect in `lock`, not in the model: it should not go on when `FOR UPDATE` returned no row. Safety then rests on the database guards and on the Prisma assumption below.

An approver who asks to decide a requisition routed to admins gets a 404, because row-level security hides it. They never get the 403 "not-decider".

`EditOnlyInDraft` rests on the service alone. The database lets a requester change the justification or cost center of their own non-draft requisition: `requisitions_own_update` has no status condition, and the trigger checks only the route and the note when the status stays the same. The `LifecycleChecks` variant shows this.

## Scope

Verified, in every interleaving within these bounds:

- One requisition, first saved with large lines, owned by a requester or by an admin.
- The company's rules: none, or one threshold between small and large lines that requires an APPROVER or an ADMIN. TLC tries each.
- Eight concurrent requests: one edit (saving no lines, small lines or large lines), one submit, one cancel, the owner approving their own requisition, an approver approving, another admin rejecting, and two buyers converting. The receiving tail moves after an order commits.

Assumptions about Postgres and Prisma:

- READ COMMITTED, because `TenantDb.run` uses Prisma's default interactive transaction and nothing sets another level.
- `SELECT ... FOR UPDATE` applies the SELECT policies and the USING clauses of the UPDATE policies. A row that fails them on the statement's snapshot is skipped without waiting. A row that passes and is locked makes the request wait. Postgres then locks the newest committed version and rechecks it, and a row that fails the recheck is not returned but stays locked.
- An `UPDATE` takes `FOR NO KEY UPDATE`, which does not conflict with `FOR KEY SHARE`. The foreign key check of an insert takes `FOR KEY SHARE` on the requisition, which conflicts with `FOR UPDATE`. A unique index insert that meets another transaction's uncommitted row waits for it, and fails if that row commits.
- Prisma's `requisition.update` is one `UPDATE ... RETURNING`, and it raises P2025 when no row matches. If it ever reads the row first and then updates nothing without an error, an unlocked decider could commit its decision row on a cancelled requisition. A database test of that race would confirm the assumption.
- Prisma's `createMany` with no lines inserts nothing, and a `deleteMany` that row-level security filters to no rows raises no error.
- Waiters get the lock in any order. Postgres's queueing order is not modeled.

Out of scope:

- Company isolation, and roles or memberships that change, such as a requester promoted to approver who still owns earlier requisitions.
- Approval rules that change between a submit's read and its update. The trigger then raises a check violation, which reaches the client as a 500. The model keeps the rules fixed.
- The other outcome of each decider: the approver only approves and the other admin only rejects. The trigger's two decision branches differ only in the outcome.
- Cost center, justification and catalog validity, the CHECK constraints, the decision note, supplier activity, line pricing, the audit log and push notifications.
- Receiving under concurrency, which the `purchase-order-receiving` skill covers.
- Liveness and fairness. TLC checks safety only.
- More requests than the bounds above. A one-off run with two submits and two approver requests also passed (18,217,170 distinct states, about 8 minutes on 12 cores).

## Coverage record

| File                                                                         | Covered                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/requisitions/requisitions.service.ts`                          | `update`, `transition`, `decide`, `lock`, `loadForChange`, `writeLines`                                                                                                                                 |
| `apps/api/src/requisitions/requisition-lifecycle.ts`                         | `TRANSITIONS`, `approvalRequirement`, `routeOf`, `mayDecide`, `decide`, `decideApproval`                                                                                                                |
| `apps/api/src/purchase-orders/purchase-orders.service.ts`                    | `create`, `requireConvertible`                                                                                                                                                                          |
| `apps/api/src/purchase-orders/purchase-order-status.ts`                      | `statusOf` (coarse)                                                                                                                                                                                     |
| `apps/api/src/tenancy/tenant-db.service.ts`                                  | `TenantDb.run` (one transaction per request, default isolation)                                                                                                                                         |
| `apps/api/src/tenancy/db-errors.ts`, `apps/api/src/tenancy/roles.ts`         | `translateDbError` and `rejectUnmatchedWrite`: the HTTP status each `refused*` and `failed*` outcome reaches the client as                                                                             |
| `apps/api/prisma/migrations/20260105000000_requisitions/migration.sql`       | policies `requisitions_own_update`, `requisition_lines_own_draft_insert`, `requisition_lines_own_draft_delete`                                                                                          |
| `apps/api/prisma/migrations/20260106000100_approval_rules/migration.sql`     | policies `requisitions_visible_select`, `requisitions_decider_update`, `requisition_decisions_decider_insert`; trigger `requisitions_guard_status`; unique index `requisition_decisions_requisition_id_key` |
| `apps/api/prisma/migrations/20261010125659_purchase_orders/migration.sql`    | policies `requisitions_buyer_approved_select`, `purchase_orders_select` (buyers see every order), `purchase_orders_buyer_insert`; unique index `purchase_orders_requisition_id_key`; foreign key `purchase_orders_company_id_requisition_id_fkey`          |

**Sync commit:** `8d8cee64ad39a34784d50d2fb83221b2ed425571`. The model was last confirmed to describe the covered code at this commit. Move it forward only after you read every change to the covered code since this commit, confirm that the model matches the code at the new commit, and see `run.sh` and `run.sh --broken` both exit 0. Update the `file:line` references in the table and in the `.tla` comments at the same time.

## Files

- `RequisitionToOrder.tla` is the model and the invariants.
- `MC.cfg` holds the bounds, the switches and the invariants TLC checks.
- `run.sh` fetches the pinned tools and runs TLC. `steps.awk` turns a TLC trace into the step list.
