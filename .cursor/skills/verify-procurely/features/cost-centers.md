# Cost centers

Admins add, rename, and delete cost centers of the selected company. Other roles see the list without those actions.

## Sub-features

- `list-by-company` shows that company's cost centers only.
- `admin-add` creates a cost center.
- `admin-rename` renames one.
- `admin-delete` removes one.
- `requester-readonly` hides add/rename/delete for Alice.

## How to get to it (user POV)

- Sign in, land on home (`Procurely`). Cost centers are on that screen under `Cost centers`.
- Dave (admin): person id `00000000-0000-4000-8000-0000000000b4` via `Person id` then `Sign in with id`.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed unless continuing a documented mutation sequence.

- **Requester list.** Sign in as Alice. Acme Trading selected. Cost centers IT, MKT, OPS. No `Add cost center`, no `Rename IT`, no `Delete IT`.
- **Admin add.** Sign out. Sign in with id `00000000-0000-4000-8000-0000000000b4`. Click `Add cost center`. Fill `Cost center code` `HR`, `Cost center name` `People`. Click `Save cost center`. List shows HR.
- **Admin rename.** Click `Rename HR`. Fill `New name for HR` with `Human Resources`. Click `Save name of HR`.
- **Admin delete.** Click `Delete HR`. HR is gone.
- **Proof.** Snapshot and screenshot after add (HR visible) and after delete (HR absent). Optionally `GET /audit-log` as Dave for `cost_center.created`, `cost_center.renamed`, `cost_center.deleted`.

## Gotchas

- Cost center management is admin-only in the UI; the database enforces it either way.
- `Rename` / `Delete` accessible names include the **code** (`Rename HR`), not the display name.
- Reseed after mutations before proving other features.
