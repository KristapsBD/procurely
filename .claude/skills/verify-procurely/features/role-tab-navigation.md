# Role tab navigation

Entry point: dev login by person id (`Person id` field, then `Sign in with id`), seeded database. Ids are in `apps/api/prisma/seed-data.ts`.

## Expected

| Person       | Role      | Landing     | Tabs                                        |
| ------------ | --------- | ----------- | ------------------------------------------- |
| Alice (Acme) | requester | `/requests` | Requests, Company                           |
| Bob          | approver  | `/inbox`    | Inbox, Company                              |
| Carol        | buyer     | `/orders`   | Orders, Suppliers, Company                  |
| Dave         | admin     | `/inbox`    | Inbox, Requests, Orders, Suppliers, Company |

Tabs are `tab` nodes in the full snapshot (`snapshot --full`). The Company tab holds the company chip, the company line and `Sign out`; only an admin also has `Members`, `Approval rules` and `Cost centers`.

## Recipes

- **Landing per role.** Sign in as each person above, read the page url and the `tab` nodes, screenshot.
- **Switch recomputes tabs.** Sign in as Alice (tabs Requests, Company). `Company`, `Switch company`, `Nordic Supplies`. The page lands on `/inbox`, tabs are Inbox, Company and the line reads `Nordic Supplies (SEK), you are approver`.
- **Single company.** Sign in as Mallory or another one-company person: the chip has no chevron and no `Switch company` button.
- **Catalog.** As Carol, `Suppliers` tab, `Catalog` segment.
