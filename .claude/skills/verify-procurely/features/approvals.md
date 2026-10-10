# Approvals

Admins set per-company approval rules: from a threshold on (inclusive), Approver or Admin approves. On submit, the rule with the highest threshold at or below the total applies, in one step. Under every threshold the requisition is approved at once, with the reason shown. A company without rules (Acme and Nordic in the seed) leaves every submitted requisition to an admin. Approvers and admins approve with an optional comment or reject with a required reason from `Approvals`. Nobody decides their own requisition.

## Sub-features

- `admin-rules` as Dave: add and delete a rule from `Approval rules`.
- `auto-approve` as Alice: a total under the lowest threshold is `Approved` with the reason.
- `approver-approve` as Bob (person id `00000000-0000-4000-8000-0000000000b2`): approve from the inbox; Alice reads the comment.
- `approver-reject` as Bob: reject with a reason; Alice reads it.
- `no-self-approval` as Dave: his own submitted requisition is not in his inbox and offers no `Approve`.
- `no-rules-admin` as Dave on a fresh seed: Alice's submitted requisition waits for an admin.
- `no-entry` as Carol (buyer): no `Approvals`, no `Approval rules`. Alice (requester on Acme): no `Approvals`.
- `isolation` as Erik (Nordic admin, person id `00000000-0000-4000-8000-0000000000b5`): Nordic's `Approval rules` does not show Acme's rule.

## How to get to it (user POV)

- From home, `Approvals` (approvers and admins) and `Approval rules` (admins only).
- Dave: person id `00000000-0000-4000-8000-0000000000b4` via `Person id` then `Sign in with id`. Bob and Erik the same way with their ids.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed. The seed has no Acme rules; this recipe adds one and needs a reseed afterwards.

- **No rules.** Sign in as Alice, `Requisitions`, open `Paper for the quarterly reports`, `Submit`. Detail shows `Submitted · requested by Alice Requester` and `The company has no approval rule, so an admin decides.` Sign in as Bob: `Approvals` shows `Nothing is waiting for your decision.` Sign in as Dave: `Approvals` lists it with `Approve Paper for the quarterly reports` and `Reject Paper for the quarterly reports`. Leave it.
- **Add a rule.** As Dave, home, `Approval rules`, `Add approval rule`, `Threshold (EUR)` `500.00`, `Approver`, `Save rule`. List shows `From 500.00 EUR: Approver approves`.
- **Auto-approve.** As Alice, `New requisition`, `Cost center OPS`, justification `Toner`, `Add A4 copy paper, box of 5 reams`, quantity 2 (49.98 EUR), `Save draft`, `Submit`. Detail shows `Approved · requested by Alice Requester` and `Approved automatically: the total of 49.98 EUR is under the company's lowest approval threshold of 500.00 EUR.`
- **Approve.** As Alice, new requisition `New laptop`, `Add Laptop 14"`, quantity 1 (1199.00 EUR), save, `Submit`: `Submitted` and `Waiting for an approver or an admin.`, only `Cancel requisition`. Sign in as Bob, `Approvals`: `New laptop`, `1199.00 EUR · requested by Alice Requester`. Fill `Comment on New laptop (optional)` with `Within budget`, click `Approve New laptop`: `Approved: New laptop`. As Alice, open `New laptop`: `Approved · …` and `Approver's comment: Within budget`.
- **Reject.** As Alice, another `Spare laptop` of 1199.00 EUR, submit. As Bob, `Reject Spare laptop` is disabled until `Reason for rejecting Spare laptop` is filled; fill `Use the pool laptops`, click it. As Alice: `Rejected · …` and `Rejection reason: Use the pool laptops`.
- **No self-approval.** As Dave, `Requisitions`, raise and submit his own 1199.00 EUR requisition: it offers only `Cancel requisition`. `Approvals` does not list it.
- **No entry.** Carol: no `Approvals` and no `Approval rules` on home; `/approvals` directly shows `Approvals are for approvers and admins.` Alice on Acme: no `Approvals`.
- **Isolation.** Sign in as Erik. Home shows Nordic Supplies. `Approval rules` shows `No approval rules: an admin decides every requisition.` and not `From 500.00 EUR`.
- **Proof.** Snapshots of each state. Optionally `GET /audit-log` as Dave for `approval_rule.created`, `requisition.auto_approved`, `requisition.approved`, `requisition.rejected`.
- **Reseed** (`make seed`) when done, so Acme has no rules again.

## Gotchas

- Dave's `Approvals` also lists every submitted Acme requisition under an approver rule: an admin may decide those too.
- The inbox keeps an approved or rejected requisition out of the list; the `Approved: …` / `Rejected: …` line confirms the decision.
- Rules apply on submit. A requisition submitted before a rule was added keeps its route (no rule: an admin decides).
- A full page load resets the active company to the first one. Navigate with in-app buttons.
