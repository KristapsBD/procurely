# Members

An admin sees the members of the selected company, with role and whether they are active. They invite by email and a role, change a role, and deactivate or reactivate. Inviting adds the person right away. No email is sent. Buyers, approvers and requesters have no entry point.

## Sub-features

- `list-acme` as Dave (person id `00000000-0000-4000-8000-0000000000b4`): Alice Requester, Bob Approver, Carol Buyer and Dave Admin are Active; Oscar Deactivated is Inactive.
- `invite-role-deactivate` as Dave.
- `last-admin` as Dave: deactivating him, or changing his role, is refused and the list stays as it was.
- `list-nordic` as Erik (person id `00000000-0000-4000-8000-0000000000b5`): Alice Requester with role Approver, Erik Admin, Frida Requester. Not Carol, not Oscar, not Dave.
- `no-entry` as Alice, Bob and Carol.
- `company-switch` is not driven here: no seeded person is admin of two companies. The unit test switches an admin of Acme and of Nordic and checks the members query key.

## How to get to it (user POV)

- From home, click `Members`. Only an admin of the selected company sees it.
- Dave and Erik are not dev-login quick picks. Use `Person id`, then `Sign in with id`.

## Driving it with the browser

Preconditions:

- Doctor is green. Fresh seed.

- **Dave list.** Sign in as Dave. Company line `Acme Trading (EUR), you are admin`. Click `Members`. See `Inviting adds the person right away. No email is sent.` Alice, Bob, Carol and Dave are `Active`. Oscar Deactivated is `Inactive`. No name field.
- **Invite.** Click `Invite member`. Fill `Email` with `new.hire@procurely.test`. Click `Role Buyer`, then `Invite`. The new person appears Active, role Buyer. The name is the part of the email before the @.
- **Change role.** Click `Change role of new.hire`. Click `Set new.hire to Approver`. Role reads Approver.
- **Deactivate, reactivate.** Click `Deactivate new.hire`. Status is Inactive. Click `Reactivate new.hire`. Status is Active.
- **Last admin.** Click `Deactivate Dave Admin`. The message `A company needs at least one active admin` is visible and Dave stays Active, role Admin. Click `Change role of Dave Admin`, then `Set Dave Admin to Buyer`. The same message, and Dave is still Admin.
- **Alice.** Sign out, Alice. No `Members` button. Open `http://127.0.0.1:8091/members`. The message `Not allowed for your role in this company` is visible. Alice's name is not listed as a roster.
- **Bob and Carol.** Each has no `Members` button on home.
- **Erik.** Sign out. Sign in with Erik's person id. Company line `Nordic Supplies (SEK), you are admin`. Click `Members`. Alice Requester with `Role: Approver`, Erik Admin, Frida Requester. No Carol Buyer, no Oscar Deactivated, no Dave Admin.
- **Proof.** Snapshot and screenshot of Dave's list after the invite, of the last-admin message with Dave still Active, of Alice's home without `Members`, and of Erik's Nordic list.

## Gotchas

- No seeded person is an admin of two companies, so the company switcher cannot show two member rosters for one sign-in. Dave versus Erik is the browser proof. The unit test is the switch proof.
- A full page load resets the active company to the first one. Switch companies on home and navigate with in-app buttons.
- Reseed after Dave's invitation.
