# procurely

A small multi-tenant procure-to-pay product built to learn Postgres row-level security, NestJS and Expo (React Native).

## Layout

pnpm monorepo:

- `apps/api` – NestJS API (Prisma for schema and queries)
- `apps/mobile` – Expo app (React Native, runs in Expo Go and in the browser)
- `packages/shared-types` – TypeScript types shared by API and mobile

Tooling choices: Expo SDK 57 with Expo Router, pnpm workspaces (no extra monorepo tool), Node 24 (`.nvmrc`), Nest 11, Prisma 6, TypeScript 5.9, Postgres 17. Health endpoint: `GET /health`.

## Backend stack (Docker)

Requires Docker with Compose and, for local installs, Node 24 and pnpm.

```sh
pnpm stack:up      # build and start Postgres + API, waits until both are healthy, prints the ports
eval "$(make -s env)"                # this checkout's COMPOSE_PROJECT_NAME, API_PORT, DB_PORT, database URLs
curl localhost:$API_PORT/health      # {"status":"ok","database":"up"}
pnpm stack:down    # stop the stack, keep the database data
pnpm stack:reset   # wipe the database volume and start fresh
```

With only Docker and make installed, the same commands exist as `make up`, `make down`, `make reset`, plus `make logs`, `make ps`, `make psql`, `make env` and `make prune`; `make help` lists them. The `pnpm stack:*` scripts and `pnpm db:reset` just call these targets.

### One stack per checkout

Every checkout (a clone, an agent worktree) runs its own stack, so several can run at once and none can wipe another's database. The Makefile derives the Compose project name and both host ports from a checksum of the checkout's absolute path: project `procurely-<checksum>`, API port `10000 + n`, Postgres port `20000 + n` (`n` is the checksum modulo 10000). The values are stable: the same folder gets the same name and ports on every run, and a folder elsewhere with the same name gets a different project name and, almost always, different ports (two checkouts share ports with a chance of about 1 in 10,000; then the second `make up` fails on the port binding, never on the other's data). Containers, the database volume (`<project>_pgdata`) and the image are all named after the project.

- **See the current stack:** `make env` prints the name, ports and database URLs; `make ps` shows its containers; `make up` ends by printing the API and Postgres addresses.
- **Plain `docker compose` and host-side scripts:** run `eval "$(make -s env)"` in the shell first. The exports belong to that checkout: `make` refuses to run in another checkout from the same shell (open a new shell there), but plain `docker compose` cannot check, so do not `cd` to another checkout with them loaded. Without it, `docker compose` falls back to its defaults (project named after the folder, usually `procurely`, ports 3000 and 5433), which is the stack every un-isolated checkout shares, and `test:http`, `rls:audit` and the API package's `db:reset` connect to port 5433. CI uses those defaults on purpose: each job has a machine to itself.
- **Fixed ports** (for example the phone test over Tailscale, or a bookmarked URL): set them in the environment, and they win over the derived values: `export API_PORT=3000` before the stack commands, or per command, `API_PORT=3000 pnpm stack:up`. Prefer not to pin `DB_PORT` to 5433: that is the port the host-side test scripts fall back to without the `make env` exports, and they wipe the database they reach. `COMPOSE_PROJECT_NAME` can be pinned the same way. Use the same values for every command against that stack, and do not pin two checkouts to the same name or ports. If a derived port happens to be taken, `make up` fails on the port binding; pin a free one.
- **Stop your stack when you finish**, agents and developers alike: `make down` (keeps the data), or `eval "$(make -s env)" && docker compose down -v` to remove the volume too. Do it before deleting a worktree or clone: Docker keeps a deleted folder's containers and volume, and no other checkout's commands will ever reach them. Stacks started before this scheme used the shared project `procurely` (volume `procurely_pgdata`); stop it from the checkout that started it with `COMPOSE_PROJECT_NAME=procurely docker compose down` once nothing uses it.
- **Remove leftover stacks.** Stopping your own stack when you finish is still the first step (`make down`). For a disposable checkout (an agent worktree about to be returned), also run `eval "$(make -s env)" && docker compose down -v --rmi local`, or `DISPOSABLE=1 .cursor/skills/verify-procurely/scripts/cleanup.sh`: `make down` keeps the volume and the image on purpose, and once the folder is gone nothing can find them. `make prune` is the safety net for stacks that were left behind. It is a dry run that lists every Compose project named `procurely` or `procurely-<digits>` that owns a volume, other than this checkout's project and any project with a running container. `make prune APPLY=1` runs `docker compose -p <project> down -v --rmi local` for each listed project, plus a removal of its built image by exact ID, and keeps the shared `postgres:17` image. It does not check whether the project's folder still exists, so a live checkout whose stack is stopped is listed too; its next `make up` just rebuilds. Projects named anything else are never touched.

Check that two checkouts are isolated (copies of the repo in two folders that are both named `procurely`, such as `/tmp/a/procurely` and `/tmp/b/procurely`):

```sh
(cd /tmp/a/procurely && make up) && (cd /tmp/b/procurely && make up)   # two names, two pairs of ports
(cd /tmp/b/procurely && eval "$(make -s env)" && docker compose exec -T db psql -U procurely -d procurely \
  -c "create table marker(v text); insert into marker values ('b')")
(cd /tmp/a/procurely && make reset)                                    # wipes a's volume only
(cd /tmp/b/procurely && eval "$(make -s env)" && curl -s localhost:$API_PORT/health && \
  docker compose exec -T db psql -U procurely -d procurely -tAc "select v from marker")   # still 'b'
```

## Company isolation (RLS)

Postgres itself decides which rows a person sees. The API connects as the restricted role `procurely_api` (`DATABASE_URL`), which cannot bypass row-level security; migrations, the seed and the RLS audit use the owner role (`DIRECT_URL`). Policies and the role are hand-written SQL in `apps/api/prisma/migrations/*_rls`, next to the Prisma-generated ones.

Every request that touches data runs through `TenantDb.run`: one transaction that first sets the transaction-local `app.current_user_id` and `app.current_company_id`. Lint enforces that handlers reach the database only through `TenantDb.run`: importing `PrismaService` or the raw `@prisma/client` under `apps/api/src` fails the `lint` job, except in the tenancy module, `prisma.service.ts`, `app.module.ts` and the health check. The one exception to `TenantDb.run` is Google sign-in, which happens before any person is known: `TenantDb.runWithoutIdentity` sets no identity (every table is empty to it) and only calls the narrow `SECURITY DEFINER` function `google_sign_in()`, which returns a person id and nothing else. Policies check them against active memberships, so a company the person has no active membership in yields no rows. The person comes from the session token (`Authorization: Bearer ...`); the company is named per request in the `X-Company-Id` header.

Seed and dev login (the dev login exists only when `NODE_ENV` is `development` or `test`, as the compose stack sets; any other value, including unset, disables it and requires `SESSION_SECRET`):

```sh
pnpm stack:up && pnpm db:reset      # reset the database schema and reload the seed (idempotent)
eval "$(make -s env)"
curl -s -XPOST localhost:$API_PORT/auth/dev-login -H 'content-type: application/json' \
  -d '{"personId":"00000000-0000-4000-8000-0000000000b1"}'      # alice -> {token, person}
curl -s localhost:$API_PORT/me -H "Authorization: Bearer $TOKEN"
curl -s localhost:$API_PORT/cost-centers -H "Authorization: Bearer $TOKEN" -H 'X-Company-Id: 00000000-0000-4000-8000-0000000000a1'
```

People sign in with Google (`GET /auth/google/start`, a browser flow; see [docs/google-sign-in.md](docs/google-sign-in.md) for how it works, why Expo Go is enough and the Google Cloud Console setup). Google is optional: its four `GOOGLE_*` values come from a gitignored `.env` at the repository root (template: `.env.example`), and without them the API runs as before. `GET /auth/options` tells the app which sign-ins exist. Automated tests never use Google: they sign in through the dev login, and the Google tests use a local stand-in with its own signing keys.

`pnpm db:reset` is `make seed` (runs inside the API container, so Docker is all you need). Seeded companies and people, with their stable ids, are in `apps/api/prisma/seed-data.ts`. Every seeded id is `00000000-0000-4000-8000-0000000000` followed by two characters. There are four companies: Acme Trading (`a1`, EUR, the main one), Nordic Supplies (`a2`, SEK), Megacorp Industries (`a3`, EUR, large) and Fresh Start Ltd (`a4`, EUR, empty). The supplier "Office Depot" exists in both Acme Trading and Nordic Supplies with a different price for the same paper, and Acme Trading also has an inactive supplier (Old Paper Mill) whose catalog item stays visible but cannot be chosen.

The twelve seeded people all have `<name>@procurely.test` addresses. The app's sign-in screen offers only some of them as quick picks, but its id field accepts any of these ids.

| Person  | Id ends in | Memberships                                                 |
| ------- | ---------- | ----------------------------------------------------------- |
| alice   | `b1`       | requester in Acme Trading, approver in Nordic Supplies      |
| bob     | `b2`       | approver in Acme Trading                                    |
| carol   | `b3`       | buyer in Acme Trading                                       |
| dave    | `b4`       | admin in Acme Trading                                       |
| erik    | `b5`       | admin in Nordic Supplies                                    |
| frida   | `b6`       | requester in Nordic Supplies                                |
| gustav  | `b7`       | admin in Megacorp Industries                                |
| hanna   | `b8`       | approver in Megacorp Industries                             |
| ivan    | `b9`       | requester in Megacorp Industries                            |
| nomad   | `ba`       | none                                                        |
| oscar   | `bb`       | requester in Acme Trading, deactivated                      |
| mallory | `bc`       | requester in Fresh Start Ltd, the attacker in the RLS tests |

## Roles, members and the audit log

Inside a company, row-level security also enforces the role of the person (requester, approver, buyer, admin):

| Table           | Read                                                                                                | Write                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `companies`     | active members of the company                                                                       | nobody (API role)                                                                                     |
| `people`        | yourself; an admin also sees the people with a membership in the current company                    | only through `invite_person()` (admin of the current company)                                         |
| `memberships`   | your own active memberships (your companies); an admin sees every membership of the current company | admin of the current company inserts and updates `role`/`active`; nobody deletes (deactivate instead) |
| `cost_centers`  | every active member                                                                                 | admins only                                                                                           |
| `suppliers`     | every active member                                                                                 | buyers and admins insert and update `name`/`active`; nobody deletes (deactivate instead)              |
| `catalog_items` | every active member                                                                                 | buyers and admins                                                                                     |
| `audit_log`     | admins of the company                                                                               | any active member appends entries as themselves; never updated or deleted                             |

Routes (all need the session token; company-scoped ones also `X-Company-Id`): `GET /companies` lists your companies and roles, `GET /companies/active` confirms the company named in the header (the client holds the selection, there is no server-side session state), `GET|POST /members` and `PATCH /members/:id` (admins: invite by email with a role, change role, deactivate or reactivate; the last active admin cannot be removed), `GET /audit-log` (admins, newest first), `GET|POST /cost-centers` and `GET|PATCH|DELETE /cost-centers/:id` (admins write), `GET|POST /suppliers` and `GET|PATCH /suppliers/:id` (buyers and admins: add, rename, deactivate or reactivate), `GET|POST /catalog-items` and `GET|PATCH|DELETE /catalog-items/:id` (buyers and admins: item, supplier and agreed unit price in integer minor units). `?selectable=true` on the supplier and catalog item lists leaves out inactive suppliers and their items: use it for anything that offers a choice for new work. A catalog item's supplier must be an active supplier of the same company when it is set (a composite foreign key on `company_id, supplier_id` rules out another company's supplier); an item keeps an inactive supplier until someone moves it. Invitations add the person to the company right away, creating the person record if the email is new; no email is sent. A later Google sign-in with that email links to the invited person when Google is authoritative for the address (Gmail or Google Workspace); see [docs/google-sign-in.md](docs/google-sign-in.md#who-a-google-sign-in-becomes). Deactivation applies from the next request, because every statement re-checks the active membership.

Every change to memberships, cost centers, suppliers and catalog items writes an audit entry in the same transaction: call `writeAudit(tx, scope, { action, entityType, entityId, details })` from `src/audit/audit-log.ts` inside `TenantDb.run` for any new workflow.

Host ports are derived per checkout (see [One stack per checkout](#one-stack-per-checkout)); `make env` prints them, and `API_PORT` and `DB_PORT` override them, e.g. `API_PORT=3100 pnpm stack:up`.

### Inviting a person

The app has no members screen yet, so an invitation is an API call, `POST /members` with an admin's session. This one signs in as dave (admin in Acme Trading) through the dev login and invites an address to Acme Trading as a requester:

```sh
eval "$(make -s env)"
TOKEN=$(curl -s -XPOST localhost:$API_PORT/auth/dev-login -H 'content-type: application/json' \
  -d '{"personId":"00000000-0000-4000-8000-0000000000b4"}' | jq -r .token)
curl -s -XPOST localhost:$API_PORT/members -H "Authorization: Bearer $TOKEN" \
  -H 'X-Company-Id: 00000000-0000-4000-8000-0000000000a1' -H 'content-type: application/json' \
  -d '{"email":"you@gmail.com","role":"REQUESTER"}'
```

`role` is one of `REQUESTER`, `APPROVER`, `BUYER` and `ADMIN`. To invite to Nordic Supplies or Megacorp Industries, sign in as their admin (erik or gustav in the [seeded people](#company-isolation-rls)) and change `X-Company-Id` to match.

## Mobile app

Expo SDK 57 (TypeScript, Expo Router, TanStack Query). The sign-in screen offers Google sign-in when the API has it configured (otherwise it says so) and, in development bundles, the dev login as a seeded person. Signed in, the app shows their companies with a switcher and lists the cost centers of the selected company (admins add, rename and delete them there). The Suppliers and Catalog screens show the selected company's suppliers and catalog items with prices; buyers and admins add and edit them, deactivate suppliers and delete items, and everyone else only reads. The app offers only the actions the role allows; the database enforces it either way. The API address is one value, `EXPO_PUBLIC_API_URL`, read when Metro bundles; nothing in the code names a host. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` (gitignored) or export it in the shell, then restart Metro (`--clear` after changing it).

In the browser (the fast loop, and how an agent drives the app, see [docs/agent-browser-verification.md](docs/agent-browser-verification.md)):

```sh
pnpm stack:up && pnpm db:reset && eval "$(make -s env)"
EXPO_PUBLIC_API_URL=http://localhost:$API_PORT pnpm mobile:web      # Metro on http://localhost:8081
```

The API allows cross-origin browser calls only when `NODE_ENV` is `development` or `test` (the same fail-closed switch as the dev login), because the web target runs on a different port than the API.

### On a physical iPhone with Expo Go

The phone must reach two things on your machine: Metro (port 8081, serves the JavaScript) and the API (pinned to port 3000 below, the port that `tailscale serve` proxies in the [Google sign-in setup](docs/google-sign-in.md#1-an-https-name-for-the-api-on-your-tailnet)). The dev login signs in as any seeded user and the compose stack runs in development mode, so the API must **never** be put on a public tunnel or otherwise exposed to the internet. The setup below uses [Tailscale](https://tailscale.com): the phone reaches WSL directly over a private tailnet that contains only your own devices, and nothing is opened on the home network, the Windows firewall or the internet (no `.wslconfig` or firewall changes).

One-time setup, on your machine and phone:

1. In WSL (systemd must be enabled, it is by default on current WSL), install Tailscale and sign in: `curl -fsSL https://tailscale.com/install.sh | sh`, then `sudo tailscale up` and open the printed login URL.
2. On the iPhone, install the Tailscale app from the App Store and sign in with the same account. Keep it connected (VPN on) while testing.
3. Create a free Expo account. Sign in to it in the Expo Go app on the iPhone, and sign in the Expo CLI on your machine to the same account (`npx expo login` in `apps/mobile`). On a physical iPhone, Expo Go opens a project only when both are signed in to the same account. Otherwise it shows "You need to be signed in to Expo Go and Expo CLI to open your project". After signing in, tap Try Again on that screen. Metro does not need a restart. Android, simulators and published updates do not need this ([Expo: sign-in required](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/)).

Run each session from the repository folder itself. This checkout gets its own stack (see [One stack per checkout](#one-stack-per-checkout)), so the phone test needs no separate clone.

```sh
export API_PORT=3000                              # fixed API port instead of the derived one; keep it for every stack command
pnpm stack:up && pnpm db:reset                    # compose publishes the API on port 3000
TS_IP=$(tailscale ip -4)                          # the WSL address on the tailnet, 100.x.y.z
EXPO_PUBLIC_API_URL=http://$TS_IP:3000 REACT_NATIVE_PACKAGER_HOSTNAME=$TS_IP pnpm mobile:start
```

Then open Expo Go on the iPhone and enter `exp://<TS_IP>:8081` (or scan the QR code Metro prints). Sign in with a dev-login quick pick. Google sign-in on the phone also needs `tailscale serve` (an https name for the API, still tailnet only) and a Google OAuth client: follow [docs/google-sign-in.md](docs/google-sign-in.md#setup-done-by-hand).

Keep the tailnet private to your own devices: do not share the node, and do not use `tailscale funnel` (it publishes a port to the internet). Compose also publishes Postgres (`make env` shows the port), which is reachable on the tailnet the same way.

Expo's built-in tunnel (`expo start --tunnel`) is a fallback for Metro only: it does not carry the app's API calls, so sign-in would fail unless the API is reachable some other way. Do not expose the API to get around this.

**Verified** on 2026-10-04. With the steps above, the app opens in Expo Go on an iPhone over Tailscale. What is verified for Google sign-in on the phone is listed in [docs/google-sign-in.md](docs/google-sign-in.md#expo-go-is-enough-no-development-build).

## CI

Every pull request runs `.github/workflows/ci.yml`: fifteen parallel jobs, each its own required check with a three-minute timeout:

| Check                   | What it enforces                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`                | Prettier                                                                                                                                           |
| `lint`                  | ESLint, cyclomatic complexity cap of 10, only the tenancy module touches the raw database client                                                   |
| `typecheck`             | `tsc` in the API and shared types (the Expo app has its own job)                                                                                   |
| `unit-tests`            | API tests that need no database                                                                                                                    |
| `api-tests`             | HTTP tests as seeded users against a real Postgres                                                                                                 |
| `rls-audit`             | every table has RLS enabled and forced, the API role cannot bypass it, the audit log has no update or delete path                                  |
| `docker-smoke`          | builds the API image, starts it with Postgres, hits `/health`                                                                                      |
| `coverage`              | coverage floor on the API (statements and lines 80%, branches 75%, functions 80%; thresholds in `apps/api/jest.http.config.json`), HTTP tests only |
| `dependency-boundaries` | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), rules in `.dependency-cruiser.cjs` (`pnpm deps:check`)                       |
| `duplicate-code`        | [jscpd](https://github.com/kucherenko/jscpd), at most 3% duplicated lines, config in `.jscpd.json` (`pnpm dup:check`)                              |
| `secret-scan`           | [gitleaks](https://github.com/gitleaks/gitleaks) over the full git history                                                                         |
| `dependency-audit`      | `pnpm audit --audit-level high` (`pnpm audit:deps`), except GHSA-86w9-cpqp-85rv (see below)                                                        |
| `api-contract`          | fails when the committed contract or shared client types differ from what the API generates (`pnpm contract:check`)                                |
| `mobile-typecheck`      | `tsc` on the Expo app (`pnpm typecheck:mobile`; the `typecheck` job covers the API and shared types)                                               |
| `mobile-unit-tests`     | Jest (jest-expo) unit tests of the Expo app, no database or device (`pnpm test:mobile`; `unit-tests` covers the API)                               |

Branch protection on `main` should require exactly those fifteen check names.

`audit:deps` ignores one advisory, GHSA-86w9-cpqp-85rv (high, `node-forge` up to 1.4.0, RSA PKCS#1 v1.5 signature verification). It comes in through `@expo/cli` (the Metro dev server and `expo export` on a developer machine; it is not in the API or in the app bundle), and no patched version exists (1.4.0 is the latest release). Review ignored advisories periodically and remove an ignore as soon as an upstream fix exists: remove the `--ignore` in the root `package.json` once `node-forge` or Expo ships a fix (check on each Expo upgrade).

Every push to `main` also runs `.github/workflows/publish-image.yml`, which builds the API image and pushes it to `ghcr.io/kristapsbd/procurely-api` tagged with the commit SHA and `latest`. It runs on `main` only and is not a required check.

### API contract

The API publishes its contract as OpenAPI at `GET /openapi.json`. The request and response shapes are the DTO classes in `apps/api/src/contract/api.dto.ts` (with the controllers' routes, the Swagger build plugin does the rest). The generated outputs are committed:

- `apps/api/openapi.json` – the contract
- `packages/shared-types/src/generated/api.ts` – TypeScript types generated from it with `openapi-typescript`; `@procurely/shared-types` re-exports them under their schema names (`Member`, `CostCenter`, ...), so the mobile app and the HTTP tests use exactly what the API declares

After changing a route or a DTO, run `pnpm contract:generate` and commit the result. `pnpm contract:check` (the `api-contract` job) fails if either file differs from what the API would generate. Never edit the generated files or hand-write request or response types in `shared-types`.

### Mutation testing

`.github/workflows/mutation.yml` runs [Stryker](https://stryker-mutator.io) weekly (Monday 03:00 UTC) and on demand. It is report only: it never runs on pull requests and is not a required check. The HTML report is the `mutation-report` artifact of the run and the score is in the run summary. It mutates a few pure-logic files of the API (list in `apps/api/stryker.config.json`) against the HTTP test suite and resets the database before every test run, so it needs the compose Postgres and takes tens of minutes. Locally: `eval "$(make -s env)" && docker compose up -d --wait db && pnpm --filter @procurely/api mutation`.

## Development

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck                                # API and shared types
pnpm typecheck:mobile
pnpm test                                     # API unit tests, no database needed
pnpm test:mobile                              # mobile unit tests
pnpm --filter @procurely/api test:http        # HTTP/RLS tests; resets and seeds the compose database first
pnpm --filter @procurely/api rls:audit        # RLS audit against the seeded compose database
pnpm --filter @procurely/api test:coverage    # HTTP tests with the coverage floor (same database needs)
pnpm deps:check && pnpm dup:check && pnpm audit:deps && pnpm contract:check
```

`test:http`, `rls:audit` and `test:coverage` need the Postgres container and destroy its data. Run `eval "$(make -s env)"` first, then `docker compose up -d --wait db` (or `pnpm stack:up`), so both the container and the tests use this checkout's stack: the exports set `DATABASE_URL` and `DIRECT_URL`, which win over the defaults in `apps/api/db.env` (port 5433, the un-isolated default stack). The reset refuses to run against a non-local host.
