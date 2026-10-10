# Purchase orders

A buyer or admin turns an approved requisition into a purchase order for one active supplier, with one or more lines (item, quantity, unit price) and a total in minor units. A requisition converts once. Buyers and admins read every purchase order of the company; a requester reads the orders of their own requisitions; an approver those of requisitions they decided. Everyone else's orders are invisible to them.

## Sub-features

- `create` as Carol (buyer, person id `00000000-0000-4000-8000-0000000000b3`): `Purchase orders`, `New purchase order`, pick an approved requisition and an active supplier, adjust lines, `Create purchase order`.
- `convert-once` as Carol: the ordered requisition is no longer offered in the form.
- `inactive-supplier` as Carol: an inactive supplier is not offered in the form.
- `visibility` as Alice (requester): `Purchase orders` lists only orders of her own requisitions and has no `New purchase order`. Bob (approver) sees none.
- `isolation` as Erik (Nordic admin, person id `00000000-0000-4000-8000-0000000000b5`): Nordic's list shows the seeded order and none of Acme's.

## How to get to it (user POV)

- From home, `Purchase orders` (every role). Only buyers and admins get `New purchase order`.
- Carol, Dave and Erik sign in with `Person id` then `Sign in with id`.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed. Acme has no approved requisition in the seed, so this recipe makes one and needs a reseed afterwards.

- **Prepare.** Sign in as Alice, `Requisitions`, `New requisition`, `Cost center OPS`, justification `Toner and pens`, `Add A4 copy paper, box of 5 reams`, `Save draft`, `Submit`. Sign in as Dave, `Approvals`, `Approve Toner and pens`.
- **Create.** Sign in as Carol. Home shows `Purchase orders`. Open it: `No purchase orders yet.`, `New purchase order`. Click `Order Toner and pens`, `Supplier Office Depot` (`Supplier Old Paper Mill` is not offered: it is inactive). The form shows `Quantity of A4 copy paper, box of 5 reams` `1` and `Unit price of A4 copy paper, box of 5 reams (EUR)` `24.99`. Set the quantity to `3` and the price to `24.00`: `Total 72.00 EUR`. Click `Create purchase order`. Detail shows `Toner and pens`, `Office Depot · ordered by Carol Buyer`, `Status: Issued`, `3 × A4 copy paper, box of 5 reams at 24.00 EUR = 72.00 EUR (0 received)` and `Total 72.00 EUR`. Receiving goods against it is in [Goods receipts](./goods-receipts.md).
- **Convert once.** `Back to purchase orders`, `New purchase order`: `No approved requisition is waiting to be ordered.`
- **Visibility.** Sign in as Alice, `Purchase orders`: the order is listed, there is no `New purchase order`. Sign in as Bob: `No purchase orders yet.`
- **Isolation.** Sign in as Erik. Home shows Nordic Supplies. `Purchase orders` lists `Paper for the spring` (`Office Depot · 279.00 SEK · Closed`: the seed delivers and closes it) and not `Toner and pens`.
- **Proof.** Snapshots of each state. Optionally `GET /purchase-orders` as Carol and `GET /audit-log` as Dave for `purchase_order.created`.
- **Reseed** (`make seed`) when done.

## Gotchas

- A buyer's `Requisitions` entry does not exist: the approved requisitions to order are reached through `New purchase order`.
- A full page load resets the active company to the first one. Navigate with in-app buttons.
- Sign-in by person id: use the `Person id` field and `Sign in with id` button.
