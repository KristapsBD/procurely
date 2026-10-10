# Goods receipts

A buyer or admin confirms deliveries against the lines of a purchase order, with an optional note per line (damage, a shortfall). The order's status follows by itself: `Issued`, then `Partially received`, then `Fully received`. Receiving more than was ordered is refused. A receipt is never edited or deleted: a mistake is corrected by a later entry with a negative quantity and a note. A buyer or admin closes a fully received order (`Closed`); a closed order takes no more entries. Everyone who can read the order sees its deliveries; only buyers and admins can record them.

## Sub-features

- `partial` as Carol (buyer, person id `00000000-0000-4000-8000-0000000000b3`): record fewer than ordered on a line with a note; status `Partially received`.
- `full-and-close` as Carol: record the rest; status `Fully received`, `Close order` appears; closing gives `Closed` and removes the delivery form.
- `over-receive` as Carol: a quantity above what is still expected shows `Only N still expected` and `Record delivery` stays disabled.
- `correct` as Carol: a negative quantity needs a note and lowers the received count; the earlier entry stays in the list.
- `read-only` as Alice (requester): the order shows `Deliveries` and the history but no form and no `Record delivery`.

## How to get to it (user POV)

- Home, `Purchase orders`, `Open order of <justification>`. The `Deliveries` section is at the bottom of the order.
- Carol and Dave sign in with `Person id` then `Sign in with id`.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed. This recipe makes its own requisition and order (`Toner and pens`) so it does not disturb the seeded ones, and needs a reseed afterwards. The seeded orders already show each status; see [Seed dataset](./seed-dataset.md).

- **Prepare.** Follow the Prepare and Create steps of [Purchase orders](./purchase-orders.md) (justification `Toner and pens`, quantity `3`, price `24.00`), then stay signed in as Carol on the order detail.
- **Partial.** `Status: Issued` and `Nothing received yet.` are shown. Type `2` into `Received now of A4 copy paper, box of 5 reams` and `one box dented` into `Note for A4 copy paper, box of 5 reams`. Click `Record delivery`. Expect `Status: Partially received`, `A4 copy paper, box of 5 reams: 2 of 3 received` and a history line `+2 × A4 copy paper, box of 5 reams (one box dented)`.
- **Over-receive.** Type `2` into the quantity field: `Only 1 still expected` shows and `Record delivery` is disabled.
- **Full and close.** Type `1`, `Record delivery`. Expect `Status: Fully received` and a `Close order` button. Click it: `Status: Closed`, `Closed by Carol Buyer on <date>`, and no `Record delivery` or `Close order`.
- **Read-only.** Sign in as Alice, `Purchase orders`, open the order: `Deliveries` and the two history lines show, no form.
- **Correct** (on a fresh order instead of the closed one): record `3`, then type `-1`: `A correction needs a note` shows. Add the note `miscount`, `Record delivery`: `Status: Partially received`, `2 of 3 received`, and both entries stay in the history.
- **Proof.** Snapshots of each state. Optionally `GET /purchase-orders/<id>/receipts` as Carol and `GET /audit-log` as Dave for `goods_receipt.recorded` and `purchase_order.closed`.
- **Reseed** (`make seed`) when done.

## Gotchas

- The quantity field is a text field: clear it before typing the next delivery, or it keeps the last text (it is emptied after a successful record).
- A full page load resets the active company to the first one. Navigate with in-app buttons.
- Closing is final and there is no reopen.
