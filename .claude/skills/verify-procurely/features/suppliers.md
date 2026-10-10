# Suppliers

Everyone in a company can read its suppliers. Buyers and admins add, rename, deactivate, and reactivate. Inactive suppliers cannot be chosen for new orders.

## Sub-features

- `list-acme` lists Office Depot, TechWorld (Active) and Old Paper Mill (Inactive).
- `buyer-add-rename-deactivate` as Carol.
- `requester-readonly` as Alice (no Add / Rename / Deactivate).
- `empty-company` as Mallory shows `No suppliers yet.`

## How to get to it (user POV)

- From home, click `Suppliers`.
- Sign in as Carol (buyer) or Alice (requester) or Mallory.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed.

- **Carol list.** Sign in as Carol. Click `Suppliers`. Company line `Acme Trading (EUR), you are buyer`. Office Depot and TechWorld `Active`; Old Paper Mill `Inactive: cannot be chosen for new orders`. Buttons `Rename Office Depot`, `Deactivate Office Depot`, `Add supplier`.
- **Add.** Click `Add supplier`. Fill `New supplier name` with `Paper Partners`. Click `Save supplier`. It appears Active.
- **Rename.** Click `Rename Paper Partners`. Fill `New name for Paper Partners` with `Paper Partners AB`. Click `Save supplier`.
- **Deactivate.** Click `Deactivate Paper Partners AB`. Status is Inactive.
- **Alice.** Sign out, Alice, `Suppliers`. Same seed names, no `Add supplier`, no Rename/Deactivate.
- **Mallory.** Sign out, Mallory, `Suppliers`. `No suppliers yet.`
- **Proof.** Snapshot/screenshot of Carol after add and of Alice's read-only list.

## Gotchas

- Nordic Supplies after a company switch shows only that company's suppliers (Office Depot with the SEK catalog, and Nordic Tech AB).
- Accessible names include the supplier name (`Deactivate Office Depot`).
- Reseed after Carol's mutations.
