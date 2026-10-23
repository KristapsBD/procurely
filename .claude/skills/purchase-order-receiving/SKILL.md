---
name: purchase-order-receiving
description: Model-check goods receipts and purchase order closure under concurrent requests with TLA+ (TLC in Docker). Use when a change touches the goods_receipts migration triggers or RLS policies, GoodsReceiptsService.create or close, the TenantDb transaction, or receipt input parsing, or when asked whether concurrent receipts can over-receive, go below zero, or land on a closed order.
---

# Purchase order receiving

**Property.** For every purchase order line, the committed net received quantity (the sum of its `goods_receipt_lines.quantity`) stays between zero and the ordered quantity, no goods receipt line commits after the order's closure, and a closure commits only when every line is received exactly as ordered.

**Harm if broken.** Stock and three-way match would show goods received that were never ordered, or a closed order would keep changing.

The model is `PurchaseOrderReceiving.tla` in this directory. It describes the real concurrency design: per-order `pg_advisory_xact_lock` in two `BEFORE INSERT` triggers, Postgres READ COMMITTED, one transaction per request. TLC explores every interleaving of the requests below and checks the property in every reachable state.

## Run it

From the repo root:

```sh
.claude/skills/purchase-order-receiving/run.sh
```

Exit 0 means every invariant holds. Any other exit is a failure, and the script prints the violated invariant and the counterexample, one line per step, as `<step>. <request> <action> -> <next label>`. Needs Docker and network on the first run. It downloads `tla2tools.jar` v1.7.4 (TLC 2.19, sha256-pinned) into the gitignored `.cache/` and runs it in `eclipse-temurin:21-jre` pinned by digest. It takes about 25 seconds and runs two configurations:

- `code`: the code as it is, including the service's pre-checks (about 87,000 distinct states).
- `triggers-only`: the same with `AppPrecheck = FALSE`, so the database alone must hold the property (about 610,000 distinct states).

To prove the check can still fail, run `run.sh --broken`. It exits 0 only if TLC catches each broken variant with an invariant violation. Run it after any edit to the model.

## When to use it

Run it when a diff touches anything in the coverage record below. List what changed since the model was last confirmed, committed or not:

```sh
git diff --stat bb9ccf9d68bf4902ac993b7d0b39fdf157ff635f -- \
  apps/api/prisma/migrations/20261010130551_goods_receipts/migration.sql \
  apps/api/src/purchase-orders/goods-receipts.service.ts \
  apps/api/src/purchase-orders/goods-receipt-input.ts \
  apps/api/src/purchase-orders/purchase-order-status.ts \
  apps/api/src/tenancy/tenant-db.service.ts
{ git diff --name-only bb9ccf9d68bf4902ac993b7d0b39fdf157ff635f -- apps/api/prisma/migrations
  git ls-files --others --exclude-standard apps/api/prisma/migrations; } |
  xargs -r grep -lE 'goods_receipt|purchase_order_closures|advisory'
```

The second command lists new migrations that mention the covered tables. Any that redefines `goods_receipt_lines_guard`, `purchase_order_closures_guard`, the `goods_receipts_buyer_insert` policy, or the unique indexes counts, as does any new code path that inserts into `goods_receipt_lines` or `purchase_order_closures` (`grep -rn 'goodsReceiptLine\.\|purchaseOrderClosure\.' apps/api/src`).

## Mirror the change into the model first

Running the model unchanged after a code change checks the old code. Before you run, read the diff and change the model the same way, then run.

| Code (at the sync commit)                                                                                   | Model                                | Switch in `MC.cfg`      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------- |
| `goods-receipts.service.ts:89-112` pre-check in `create`                                                    | `RPrecheck`                          | `AppPrecheck`           |
| `goods-receipts.service.ts:113` receipt insert, RLS `goods_receipts_buyer_insert` (`migration.sql:121-131`) | `RInsertReceipt`                     |                         |
| `goods-receipts.service.ts:120` `createMany` lines, one statement                                           | `RLinesStmt`, then one row at a time |                         |
| `migration.sql:183` `PERFORM pg_advisory_xact_lock` in `goods_receipt_lines_guard`                          | `RLock`                              | `LineGuardLocks`        |
| `migration.sql:184-186` closed check                                                                        | `RClosedCheck`                       | `LineGuardChecksClosed` |
| `migration.sql:187-189` reads `ordered` and `received`                                                      | `RReadReceived`                      | `GuardReadsAfterLock`   |
| `migration.sql:190-198` bounds checks, `RETURN NEW`                                                         | `RCheck`                             |                         |
| `goods-receipts.service.ts:130-151`, then commit (`tenant-db.service.ts:20`)                                | `RCommit`                            |                         |
| `goods-receipts.service.ts:161-169` pre-check in `close`                                                    | `CPrecheck`                          | `AppPrecheck`           |
| `goods-receipts.service.ts:170` closure insert                                                              | `CStmt`                              |                         |
| `migration.sql:208` `PERFORM pg_advisory_xact_lock` in `purchase_order_closures_guard`                      | `CLock`                              | `ClosureGuardLocks`     |
| `migration.sql:209-216` not-fully-received check                                                            | `CReadSums`                          | `GuardReadsAfterLock`   |
| `migration.sql:75` unique index `purchase_order_closures_purchase_order_id_key`                             | `CInsert`                            |                         |
| `goods-receipts.service.ts:179-185`, then commit                                                            | `CCommit`                            |                         |

How to mirror a change:

- A change that removes one of the switched elements: set that switch to `FALSE` in `MC.cfg`. For example, deleting the `PERFORM pg_advisory_xact_lock` line from `goods_receipt_lines_guard` means `LineGuardLocks = FALSE`. A function marked `STABLE`, or reads moved before the lock, means `GuardReadsAfterLock = FALSE`.
- Any other change to a row of the table: edit that action so it does what the new code does, one action per indivisible step (one SQL statement's read or write, one lock acquisition, one commit). Keep the `file:line` comment above the action current.
- A new writer of `goods_receipt_lines` or `purchase_order_closures`, or a change of isolation level: add or change the process, then update the coverage record.

A switch at `FALSE` describes broken code. It exists so a change that drops a guard can be mirrored and shown to fail. Set it back to `TRUE` when that change is reverted. `run.sh --broken` flips the switches itself and needs them all `TRUE` in `MC.cfg`.

## Read a failure

TLC exit 12 is an invariant violation. Read the printed steps against the table and the code:

- **Real bug.** Every step is one the code can take in that order, given READ COMMITTED and the lock. Report it as a bug in the code's words, for example: "two receipts of 1 on line 2 both pass `goods_receipt_lines_guard` because neither waits for the other's lock, so line 2 commits 2 received against 1 ordered." Do not weaken an invariant or the model to make it pass.
- **Modeling error.** A step the code cannot take. For example, the model reads a sum before a lock the code acquires first, a process inserts without its trigger running, or a mirrored change was put in the wrong action. Fix the model and rerun `run.sh --broken` to show the variants still fail.
- **Other exits.** Exit 11 is a deadlock: requests wait forever with no one to wake them. In this design that is a modeling error unless the code gained a second lock. Any other code, or a parse or semantic error in the log, is a broken spec, config, or tool run. The full TLC log is at `.cache/<run>.log`.

The invariants are `NetReceivedWithinOrdered`, `NoReceiptAfterClosure`, `ClosedOnlyWhenFullyReceived`, `AtMostOneClosure` and `TypeOK`, at the end of the `.tla` file.

## Scope

Verified, in every interleaving within these bounds:

- One purchase order with two lines, ordered `<<2, 1>>` (`MC.tla`).
- Three concurrent receipts and two concurrent closers. Each receipt carries one or two lines, each line at most once, with quantity `-1` (a correction) or `1` (a delivery). TLC tries every such receipt.
- Both configurations above: with and without the service pre-checks.

Assumptions about Postgres, each taken from its documented behavior:

- READ COMMITTED, since `TenantDb.run` uses Prisma's default interactive transaction and nothing sets another level.
- Each SQL statement inside a VOLATILE plpgsql trigger takes a fresh snapshot. It sees rows committed before the statement started, including those of a transaction whose commit released the advisory lock, and its own transaction's earlier rows, including earlier rows of the same `createMany`.
- Uncommitted rows are invisible to other transactions. An advisory transaction lock is held until commit or rollback. A `RAISE` rolls back the whole request.
- A unique-index insert that meets another transaction's uncommitted row waits for it, then fails if it committed.
- Buyers and admins, the only writers, can read every receipt line and closure of an order they write to, so row-level security hides nothing from the guards' sums.

Out of scope:

- Row-level security role checks, company isolation, and the `xmin` check in `goods_receipt_lines_new_receipt_insert`.
- Advisory-key hash collisions between orders. A collision only makes unrelated orders wait for each other, which adds serialization and cannot break the property.
- The service pre-checks as a guarantee. They read possibly stale data and only give a refusal a clearer reason. The `triggers-only` run shows the property holds without them.
- The audit log, response shapes, HTTP status codes, and liveness or fairness. TLC checks safety only.
- Quantities above the bounds and more requests. A one-off run with quantities `{-1, 1, 2}` also passed (570,086 distinct states for `code`, about 4.8 million for `triggers-only`, in about two minutes).

## Coverage record

| File                                                                     | Covered                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/prisma/migrations/20261010130551_goods_receipts/migration.sql` | `goods_receipt_lines_guard` and its trigger, `purchase_order_closures_guard` and its trigger, policy `goods_receipts_buyer_insert`, unique indexes `purchase_order_closures_purchase_order_id_key` and `goods_receipt_lines_goods_receipt_id_purchase_order_line_id_key` |
| `apps/api/src/purchase-orders/goods-receipts.service.ts`                 | `GoodsReceiptsService.create`, `GoodsReceiptsService.close`                                                                                                                                                                                                              |
| `apps/api/src/tenancy/tenant-db.service.ts`                              | `TenantDb.run` (one transaction per request, default isolation)                                                                                                                                                                                                          |
| `apps/api/src/purchase-orders/goods-receipt-input.ts`                    | `parseCreateGoodsReceipt` (each order line once per receipt)                                                                                                                                                                                                             |
| `apps/api/src/purchase-orders/purchase-order-status.ts`                  | `statusOf` (what the pre-checks call `CLOSED` and `FULLY_RECEIVED`)                                                                                                                                                                                                      |

**Sync commit:** `bb9ccf9d68bf4902ac993b7d0b39fdf157ff635f`. The model was last confirmed to describe the covered code at this commit. Move it forward only after you read every change to the covered code since this commit, confirm the model matches the code at the new commit, and see `run.sh` and `run.sh --broken` both exit 0. Update the `file:line` references in the table and in the `.tla` comments at the same time.

## Files

- `PurchaseOrderReceiving.tla` is the model and the invariants.
- `MC.tla` and `MC.cfg` are the bounds and switches TLC runs.
- `run.sh` fetches the pinned tools and runs TLC. `steps.awk` turns a TLC trace into the step list.
