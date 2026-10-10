# Seed dataset

A fresh seed is not empty. Each of Acme Trading, Nordic Supplies and Megacorp Industries holds a hand-written story layer (named cases for every role, status and edge case) and a generated bulk layer of about 200 requisitions with their orders. Fresh Start Ltd stays empty. This recipe proves the story layer and the volume in the web app, as several people.

## Sub-features

- `approver-inbox` as Hanna (person id `00000000-0000-4000-8000-0000000000b8`): the 500.00 EUR requisition of Ivan waits in her inbox, next to Gustav's own pending one.
- `own-pending` as Gustav (person id `00000000-0000-4000-8000-0000000000b7`): his own submitted requisition offers only `Cancel requisition`, not `Approve`, and is not in his inbox. Ivan's 5500.00 EUR requisition is.
- `auto-approved` as Ivan (person id `00000000-0000-4000-8000-0000000000b9`): the 499.99 EUR requisition is `Approved` with the automatic note.
- `approver-comment` as Lukas (person id `00000000-0000-4000-8000-0000000000bf`): the 500.01 EUR requisition is `Approved` with Hanna's comment.
- `order-statuses` as Carol (person id `00000000-0000-4000-8000-0000000000b3`): the order list shows `Issued`, `Partially received`, `Fully received` and `Closed`.
- `damaged-receipt` as Carol: the partial order shows the damage note in its deliveries.
- `correction` as Carol: the fully received order shows a `-1` correction with its note, then the replacement.
- `acme-inbox` as Dave (person id `00000000-0000-4000-8000-0000000000b4`): Acme has no rules, so an admin decides, and Dave's inbox holds seeded rows. Bob's stays empty.
- `nordic` as Erik (person id `00000000-0000-4000-8000-0000000000b5`): Frida's 25980.00 SEK laptop requisition waits for him. As Kerstin (`00000000-0000-4000-8000-0000000000be`): the auto-approved order is `Issued`.
- `volume`: the lists are long.

## How to get to it (user POV)

- Sign in with `Person id` then `Sign in with id` for everyone except Alice, Carol, Nomad and Mallory, who have quick picks.
- From home: `Approvals` (approvers and admins), `Requisitions` (requesters and admins), `Purchase orders` (everyone).

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed (`make seed`). Nothing here changes data.

- **Hanna's inbox.** Sign in as Hanna. Company line `Megacorp Industries (EUR), you are approver`. Click `Approvals`. `Waiting for your decision` lists `Safety goggles for the new shift` with `500.00 EUR · requested by Ivan Requester`, `40 × Safety goggles` and `Waiting for an approver or an admin.`, with `Approve Safety goggles for the new shift`. It also lists `Vacuum cleaners for the plant offices` (`1378.00 EUR · requested by Gustav Admin`): an approver may decide an admin's request. `Workstations for the CAD team` (5500.00 EUR) is not hers: that one needs an admin.
- **Gustav's own request.** Sign in as Gustav (`you are admin`). Click `Requisitions`, then `Open Vacuum cleaners for the plant offices`. Detail shows `Submitted · requested by Gustav Admin`, `Waiting for an approver or an admin.` and only `Cancel requisition`: no `Approve`, no `Reject`. Back on home, `Approvals` does not list it, but lists `Workstations for the CAD team` (`5500.00 EUR · requested by Ivan Requester`, `Waiting for an admin: the total reaches an admin approval rule.`).
- **Auto-approved.** Sign in as Ivan. `Requisitions`, `Open Manual pallet jack for the loading bay`. Detail shows `Approved · requested by Ivan Requester`, `Approved automatically: the total of 499.99 EUR is under the company's lowest approval threshold of 500.00 EUR.` and `Total 499.99 EUR`. The 500.00 EUR `Safety goggles for the new shift` is `Submitted` instead.
- **Approver's comment.** Sign in as Lukas. `Requisitions`, `Open Gloves for the maintenance crew`: `Approved · requested by Lukas Requester`, `Approver's comment: Approved. Keep the delivery note for the audit.` and `Total 500.01 EUR`.
- **Order statuses.** Sign in as Carol. `Purchase orders` lists, among the others, `Replacement keyboards for the support team` (`TechWorld · 549.00 EUR · Issued`), `Monitors for the new analytics team` (`TechWorld · 2890.00 EUR · Partially received`), `Laptops for the autumn interns` (`TechWorld · 5995.00 EUR · Fully received`) and `Paper and folders for the audit` (`Office Depot · 635.80 EUR · Closed`).
- **Damaged receipt.** Click `Open order of Monitors for the new analytics team`. Detail shows `Status: Partially received`, `10 × Monitor 27 inch at 289.00 EUR = 2890.00 EUR (6 received)` and under `Deliveries` the line `+6 × Monitor 27 inch (Four monitors arrived with cracked screens. TechWorld will redeliver.)`.
- **Correction.** `Back to purchase orders`, `Open order of Laptops for the autumn interns`. `Status: Fully received` with `Close order` offered, and `Deliveries` (newest first): `+1 × Laptop 14" (Replacement laptop delivered.)`, `-1 × Laptop 14" (One laptop was the wrong model and went back to TechWorld.)`, `+5 × Laptop 14"`. Do not click `Close order` here.
- **Acme inbox.** Sign in as Dave. `Approvals` includes `Second monitors for the design desks` (Alice's) among about twenty waiting requisitions. Sign in as Bob (`00000000-0000-4000-8000-0000000000b2`): `Approvals` shows `Nothing is waiting for your decision.` because Acme has no approver rule.
- **Nordic.** Sign in as Erik. `Approvals` lists `Laptops for the new sales team` (`25980.00 SEK · requested by Frida Requester`, `Waiting for an admin: the total reaches an admin approval rule.`). `Approval rules` shows `From 10000.00 SEK: Admin approves`. Sign in as Kerstin: `Purchase orders` lists `Paper and pens for the autumn campaign` (`Office Depot · 3235.00 SEK · Issued`).
- **Volume.** As Dave, on `Requisitions`, count the open buttons: `chrome-devtools-axi eval "() => document.querySelectorAll('[aria-label^=\"Open \"]').length"` returns 210. As Carol on `Purchase orders`, `[aria-label^="Open order of"]` returns 98. Rows sort newest first, so the story rows are at the top and the generated ones (`… ref A001` to `… ref A200`) below.
- **Proof.** Snapshots of each state with the signed-in name and the company line visible, plus the two counts.

## Gotchas

- The accessibility snapshot truncates long lists (it showed 73 of Carol's 98 orders). Count with `eval` on the DOM, or find rows by justification.
- Nothing here needs a reseed, but any recipe that mutates data does: `make seed` first.
- Row counts are the seed's at the time of writing (Acme 210 requisitions and 98 orders, Alice 125 of those requisitions). If the bulk layer changes, the counts move.
- A full page load resets the active company to the first one. Navigate with in-app buttons, or sign in again.
- The partial and fully received orders are seeded as Carol's; Dave may see and receive against them too. Do not record deliveries here.
