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

Host ports default to `3000` (API) and `5433` (Postgres); override with `API_PORT` and `DB_PORT`, e.g. `API_PORT=3100 pnpm stack:up`.

## CI

Every pull request runs `.github/workflows/ci.yml`: five parallel jobs, each its own required check: `format`, `lint` (ESLint, cyclomatic complexity cap of 10), `typecheck`, `unit-tests` and `docker-smoke` (builds the API image, starts it with Postgres, hits `/health`). Branch protection on `main` should require exactly those five check names.

## Development

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```
