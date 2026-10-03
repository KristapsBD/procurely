# Driving the app in the browser (agents)

The Expo app has a web target. An agent starts the stack and Metro, opens the web page with `chrome-devtools-axi`, and drives it through the accessibility tree: buttons and text carry accessible labels, so `snapshot` shows what a person sees and `click @uid` presses it. Use this to reproduce a bug or verify a change before handing off. Native-only behavior (secure storage, gestures) needs the phone or, later, an emulator; see ticket #17.

## 1. Start the stack and Metro

Check first what already runs on your machine: other worktrees may hold ports 3000 and 5433. If so, give yours its own project name and ports instead of taking theirs over.

```sh
export COMPOSE_PROJECT_NAME=procurely-mine API_PORT=3100 DB_PORT=5434   # only if 3000/5433 are taken
pnpm stack:up && pnpm db:reset                                         # seeded database, dev login enabled
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:3100 CI=1 pnpm exec expo start --web --port 8091 --clear
```

`EXPO_PUBLIC_API_URL` must match the API port. It is baked in at bundle time, so change it only together with `--clear`, and note that a value in an `.env*` file can win over the shell, so keep the address out of committed env files. `CI=1` turns off file watching (fine for a one-shot run; drop it to get reloads). The first bundle takes about 30 seconds.

## 2. Drive it

```sh
chrome-devtools-axi open http://localhost:8091      # then: chrome-devtools-axi snapshot
chrome-devtools-axi click @<uid>                     # uids come from the latest snapshot only
chrome-devtools-axi fill @<uid> "text"
chrome-devtools-axi network                          # API calls, to confirm which company a request named
chrome-devtools-axi console
```

Behaviors worth knowing:

- Snapshot uids change after every page update. Take a new `snapshot` before each `click`.
- The first load can exceed the 10 second navigation timeout while Metro bundles. The page still loads: wait, then `snapshot`.
- `open` may leave an extra tab. `pages` lists them and `selectpage <id>` picks one; closing stale ones avoids acting on an old bundle.
- If `chrome-devtools-axi open` reports `BRIDGE_NOT_READY` (it did in the WSL2 dev environment), start Chrome yourself and attach the tool to it:

  ```sh
  chrome --headless=new --no-sandbox --remote-debugging-port=9333 --user-data-dir=<scratch dir> about:blank &
  export CHROME_DEVTOOLS_AXI_SESSION=procurely CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9333
  ```

  (Chrome is in `~/.cache/puppeteer/chrome/` here.) Then `selectpage` the tab and continue.

## 3. Seeded people to sign in as

The login screen has quick picks: Alice (requester in Acme Trading, approver in Nordic Supplies), Carol (buyer), Nomad (no company), Mallory (only the empty company). The field "Person id" takes any other seeded id from `apps/api/prisma/seed-data.ts`.

## First verified interaction

Dev login, company switch, cost centers of the selected company, driven as above against the seeded database:

1. `snapshot` of `/login` showed the "Sign in as Alice" button; `click` on it.
2. The home screen showed "Signed in as Alice Requester", the company buttons "Acme Trading" and "Nordic Supplies", the line "Acme Trading (EUR), you are requester" and under "Cost centers" IT, MKT and OPS.
3. `click` on "Nordic Supplies": the line became "Nordic Supplies (SEK), you are approver" with OPS (Drift) and SALES (Försäljning). None of Acme's IT or MKT appeared.
4. `network` showed `GET /companies` and then two `GET /cost-centers` (one per company, none for Nomad), all `200`, each preceded by a `204` CORS preflight.
5. "Sign out", then "Sign in as Nomad" showed "You do not have access to any company yet. Ask an admin to invite you."

## Suppliers, catalog and cost centers (ticket #8)

Driven against a freshly seeded database. Buttons that act on one record carry the record in their accessible name ("Deactivate Office Depot", "Edit Laptop 14\"", "Rename HR"), so a snapshot line is enough to pick the right one.

1. Carol (buyer), home screen: the cost centers of Acme Trading are listed without "Add cost center", "Rename" or "Delete" (only admins manage them).
2. "Suppliers": Office Depot and TechWorld "Active", Old Paper Mill "Inactive: cannot be chosen for new orders", each with "Rename …" and "Deactivate …"/"Reactivate …". "Add supplier", fill "New supplier name" with Paper Partners, "Save supplier": it appears as Active. "Rename Paper Partners" to Paper Partners AB, then "Deactivate Paper Partners AB": it shows Inactive.
3. "Catalog": A4 copy paper "Office Depot · 24.99 EUR", Laptop 14" "TechWorld · 1199.00 EUR", Recycled paper "Old Paper Mill · 19.99 EUR" with "Supplier inactive: cannot be ordered". "Add item" offered only "Supplier Office Depot" and "Supplier TechWorld" (neither inactive supplier). A price of 12.345 showed "Enter a price like 24.99" with "Save item" disabled; 89.90 saved "USB-C dock", "TechWorld · 89.90 EUR". Editing it to Office Depot at 94.50 showed "Office Depot · 94.50 EUR"; editing Recycled paper offered "Supplier Old Paper Mill (inactive)" as the current choice and repricing it to 20.99 saved; "Delete USB-C dock" removed it.
4. Alice (requester): "Catalog" for Acme Trading listed the same items at the EUR prices with no "Add item", "Edit" or "Delete". After switching to Nordic Supplies: "Nordic Supplies (SEK), you are approver" and only A4 copy paper, "Office Depot · 279.00 SEK"; "Suppliers" listed only Nordic's Office Depot.
5. Dave (admin, by person id `…0b4`): "Add cost center" HR / People, "Rename HR" to Human Resources, "Delete HR"; each step showed in the list.
6. Mallory: "Catalog" and "Suppliers" of Fresh Start Ltd showed "No catalog items yet." and "No suppliers yet."
7. `GET /audit-log` as Dave listed, in order: `supplier.created`, `supplier.renamed`, `supplier.deactivated`, `catalog_item.created`, two `catalog_item.updated` (with from/to of the changed fields), `catalog_item.deleted` (all by Carol), then `cost_center.created`, `cost_center.renamed`, `cost_center.deleted` (by Dave).

When a flow like this is stable it becomes a Maestro script (ticket #17).
