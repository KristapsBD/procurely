# Procurely verification map

Maintained source for verifying user-facing behavior of the Expo **web** app against this checkout's API. Native clients are out of scope. Read this index, then the matching feature file.

## Baseline preconditions

- Launch with `.cursor/skills/verify-procurely/scripts/launch.sh` from the repo root.
- Source `/tmp/procurely-verify/env.sh`.
- Run `.cursor/skills/verify-procurely/scripts/doctor.sh` and require this checkout's `STACK_CHECKOUT`, a healthy API, and Metro on `8091`.
- Seed is the compose seed (`make seed`): companies Acme Trading (EUR), Nordic Supplies (SEK), Megacorp Industries, Fresh Start Ltd.
- Drive only the instance this launch started. Do not use a developer Metro on 8081 or another clone's stack.
- Start recipes from a freshly seeded database unless the feature file says otherwise.

## Driving conventions

- Open `http://127.0.0.1:8091`.
- Click by accessible name (`accessibilityLabel` / button `label`).
- Take a new accessibility snapshot before every click.
- After a mutation, `make seed` before the next unrelated feature unless the recipe restores state itself.

## Proof and skip reporting

- Capture action plus resulting state: snapshot and screenshot in `.cursor/skills/verify-procurely/evidence/<run-id>/`.
- Show the signed-in person name and the company line (`Acme Trading (EUR), you are requester`) when those are the claim.
- Report an unreachable path with the unmet precondition. Do not count a different entry point as covering a skipped one.

## Features

- [Sign in and company switch](./sign-in-company-switch.md) — dev login, company switcher, empty-company person.
- [Cost centers](./cost-centers.md) — list by company; admin add/rename/delete.
- [Suppliers](./suppliers.md) — list, buyer add/rename/deactivate, requester read-only.
- [Catalog](./catalog.md) — prices, inactive supplier, buyer edit, requester read-only.
- [Requisitions](./requisitions.md) — create, edit, submit, cancel; admin read-only; no entry for buyers and approvers.
- [Members](./members.md) — admin list, invite, role, deactivate; no entry for other roles.
