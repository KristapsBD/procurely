# procurely

A small multi-tenant procure-to-pay product built to learn Postgres row-level security, NestJS and Expo (React Native).

## Layout

pnpm monorepo:

- `apps/api` – NestJS API (Prisma for schema and queries)
- `apps/mobile` – Expo app (placeholder; real setup comes in a later ticket)
- `packages/shared-types` – TypeScript types shared by API and mobile

Tooling choices: pnpm workspaces (no extra monorepo tool), Node 24 (`.nvmrc`), Nest 11, Prisma 6, TypeScript 5.9, Postgres 17. Health endpoint: `GET /health`.

## Backend stack (Docker)

Requires Docker with Compose and, for local installs, Node 24 and pnpm.

```sh
pnpm stack:up      # build and start Postgres + API, waits until both are healthy
curl localhost:3000/health   # {"status":"ok","database":"up"}
pnpm stack:down    # stop the stack, keep the database data
pnpm stack:reset   # wipe the database volume and start fresh
```

With only Docker and make installed, the same commands exist as `make up`, `make down`, `make reset`, plus `make logs`, `make ps` and `make psql`; `make help` lists them. The `pnpm stack:*` scripts just call these targets.

## Company isolation (RLS)

Postgres itself decides which rows a person sees. The API connects as the restricted role `procurely_api` (`DATABASE_URL`), which cannot bypass row-level security; migrations, the seed and the RLS audit use the owner role (`DIRECT_URL`). Policies and the role are hand-written SQL in `apps/api/prisma/migrations/*_rls`, next to the Prisma-generated ones.

Every request that touches data runs through `TenantDb.run`: one transaction that first sets the transaction-local `app.current_user_id` and `app.current_company_id`. Lint enforces that handlers reach the database only through `TenantDb.run`: importing `PrismaService` or the raw `@prisma/client` under `apps/api/src` fails the `lint` job, except in the tenancy module, `prisma.service.ts`, `app.module.ts` and the health check. Policies check them against active memberships, so a company the person has no active membership in yields no rows. The person comes from the session token (`Authorization: Bearer ...`); the company is named per request in the `X-Company-Id` header.

Seed and dev login (the dev login exists only when `NODE_ENV` is `development` or `test`, as the compose stack sets; any other value, including unset, disables it and requires `SESSION_SECRET`):

```sh
pnpm stack:up && pnpm db:reset      # reset the database schema and reload the seed (idempotent)
curl -s -XPOST localhost:3000/auth/dev-login -H 'content-type: application/json' \
  -d '{"personId":"00000000-0000-4000-8000-0000000000b1"}'      # alice -> {token, person}
curl -s localhost:3000/me -H "Authorization: Bearer $TOKEN"
curl -s localhost:3000/cost-centers -H "Authorization: Bearer $TOKEN" -H 'X-Company-Id: 00000000-0000-4000-8000-0000000000a1'
```

`pnpm db:reset` is `make seed` (runs inside the API container, so Docker is all you need). Seeded companies and people, with their stable ids, are in `apps/api/prisma/seed-data.ts`: four companies (main EUR, SEK, large, empty) and twelve people, including a person who is requester in one company and approver in another (alice), a person with no company (nomad), a deactivated membership (oscar) and the attacker who belongs only to the empty company (mallory).

Host ports default to `3000` (API) and `5433` (Postgres); override with `API_PORT` and `DB_PORT`, e.g. `API_PORT=3100 pnpm stack:up`.

## CI

Every pull request runs `.github/workflows/ci.yml`: seven parallel jobs, each its own required check: `format`, `lint` (ESLint, cyclomatic complexity cap of 10), `typecheck`, `unit-tests` (no database), `api-tests` (HTTP tests as seeded users against a real Postgres), `rls-audit` (every table has RLS enabled and forced, the API role cannot bypass it) and `docker-smoke` (builds the API image, starts it with Postgres, hits `/health`). Branch protection on `main` should require exactly those seven check names.

Every push to `main` also runs `.github/workflows/publish-image.yml`, which builds the API image and pushes it to `ghcr.io/kristapsbd/procurely-api` tagged with the commit SHA and `latest`. It runs on `main` only and is not a required check.

## Development

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test                                     # unit tests, no database needed
pnpm --filter @procurely/api test:http        # HTTP/RLS tests; resets and seeds the compose database first
pnpm --filter @procurely/api rls:audit        # RLS audit against the seeded compose database
```

The last two need the Postgres container (`docker compose up -d --wait db`) and destroy its data. They read `apps/api/db.env` for local defaults; set `DATABASE_URL` and `DIRECT_URL` to override, e.g. when `DB_PORT` is not `5433`. The reset refuses to run against a non-local host.
