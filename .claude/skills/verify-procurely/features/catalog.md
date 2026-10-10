# Catalog

Everyone in a company can read catalog items and prices. Buyers and admins add, edit, and delete. An item whose supplier is inactive stays visible but cannot be ordered.

## Sub-features

- `list-prices` shows A4 copy paper at Office Depot 24.99 EUR and Laptop 14" at TechWorld 1199.00 EUR on Acme.
- `inactive-supplier` shows Recycled paper with `Supplier inactive: cannot be ordered`.
- `buyer-add-edit-delete` as Carol.
- `requester-readonly` as Alice; Nordic switch shows A4 copy paper at 279.00 SEK.

## How to get to it (user POV)

- From home, click `Catalog`.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed.

- **Carol list.** Sign in as Carol. Click `Catalog`. See A4 copy paper `Office Depot · 24.99 EUR`, Laptop 14" `TechWorld · 1199.00 EUR`, Recycled paper with inactive-supplier copy. `Add item` is present.
- **Invalid price.** Click `Add item`. A price of `12.345` shows `Enter a price like 24.99` and `Save item` disabled.
- **Add.** Choose `Supplier TechWorld`, name `USB-C dock`, price `89.90`, `Save item`. List shows `TechWorld · 89.90 EUR`.
- **Alice.** Sign out, Alice, `Catalog` on Acme: same seed items, no Add/Edit/Delete. Click `Nordic Supplies` then `Catalog`: only A4 copy paper `Office Depot · 279.00 SEK`.
- **Proof.** Snapshot/screenshot of Carol's list with a new item, and Alice on Nordic with SEK prices. Optionally confirm `GET /catalog-items` per company.

## Gotchas

- `Add item` offers only active suppliers; editing an item with an inactive supplier can still show `Supplier Old Paper Mill (inactive)`.
- Quote in `Laptop 14"` is in the accessible name.
- Company switch on home, then open Catalog again (or stay if already scoped).
- Reseed after mutations.
