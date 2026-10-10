# Requisitions

Requesters raise requisitions: a cost center, a justification, and catalog lines. A draft can be edited, submitted, or cancelled. A submitted requisition can only be cancelled. Admins read every requisition in the company but change only their own. Buyers and approvers have no entry point.

## Sub-features

- `seed-draft` shows Alice's `Paper for the quarterly reports`, `Draft · 49.98 EUR · Alice Requester` on Acme.
- `create-submit-cancel` as Alice.
- `edit-draft` as Alice.
- `admin-readonly` as Dave (person id `00000000-0000-4000-8000-0000000000b4`).
- `seed-volume`: Acme's list is long (over a hundred of Alice's own); find rows by justification.
- `no-entry` as Carol (buyer) and as Alice on Nordic (approver there).

## How to get to it (user POV)

- From home, click `Requisitions`. Only requesters and admins see it.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed.

- **Create.** Sign in as Alice. Click `Requisitions`, then `New requisition`. Click `Cost center IT`, fill `Justification`, click `Add A4 copy paper, box of 5 reams` and `Add Laptop 14"`, set `Quantity of …` fields to 3 and 2. See `Estimated total 2472.97 EUR`. Click `Save draft`. Detail shows `Draft · requested by Alice Requester`, `Cost center: IT`, `Total 2472.97 EUR`, and `Edit draft`, `Submit`, `Cancel requisition`.
- **Submit, cancel.** Click `Submit`: `Submitted · …`, only `Cancel requisition` left. Click it: `Cancelled · …`, no actions.
- **Edit.** Find and open the seed draft `Paper for the quarterly reports` (`Open Paper for the quarterly reports`), `Edit draft`, set quantity 4, `Save draft`: `Total 99.96 EUR`.
- **Nordic.** On home click `Nordic Supplies`: line reads `you are approver` and there is no `Requisitions` button.
- **Carol.** Sign in as Carol: no `Requisitions` button. Opening `/requisitions` directly shows `Requisitions are for requesters and admins.`
- **Dave.** Sign in with Dave's person id. `Requisitions` lists everyone's rows, Alice's and Paula's among them. Opening her draft shows no action buttons: an admin never edits someone else's draft. Acme has no approval rules, so a requisition Alice submitted shows `Approve …` and `Reject …` to Dave (see [Approvals](./approvals.md)), still with no `Edit draft` or `Cancel requisition`.
- **Proof.** Snapshots of each state. Optionally `select action from audit_log where action like 'requisition.%'` in the db container.

## Gotchas

- Quote in `Laptop 14"` is in the accessible name.
- Recycled paper is not offered: its supplier is inactive.
- A full page load or browser back/forward resets the active company to the first one. Switch companies on home and navigate with in-app buttons.
- Reseed after mutations.
