---
name: verify-procurely
description: Drive Procurely's Expo web app against this checkout's API stack to prove user-facing behavior. Use when reproducing a bug, verifying a UI or auth change, or checking company isolation in the browser.
---

# Verify Procurely

Primary surface: the Expo **web** app at `http://127.0.0.1:$METRO_PORT` (printed by launch; see Launch). Secondary: HTTP to this checkout's Nest API. Do not start Expo Go, an emulator, or a physical phone for verification; native-only behavior is out of scope (ticket #17).

Read `features/README.md` before driving. Drive the mapped feature the task names; a proof of one entry point does not cover the others.

Repo root is the checkout that contains this skill. All `make` / `pnpm` commands run from there. Never `cd` into another Procurely checkout with this shell's `make env` exports still set.

## Launch

This checkout already isolates Docker (project name and ports from the folder path). Metro for verification uses a per-checkout port, `API_PORT + 20000`, so it collides neither with a developer Metro on 8081 nor with another checkout's verification Metro. Launch state lives in `/tmp/procurely-verify/<compose project>/`, never shared between checkouts.

```sh
.claude/skills/verify-procurely/scripts/launch.sh
```

Ready when:

- `GET http://localhost:$API_PORT/health` returns `{"status":"ok","database":"up"}` (`API_PORT` from `make -s env`)
- `http://127.0.0.1:$METRO_PORT` answers (Metro / Expo web)

The script writes `metro.pid`, `metro.log` and `env.sh` under `/tmp/procurely-verify/<compose project>/` (`<compose project>` is `COMPOSE_PROJECT_NAME` from `make -s env`) and exports `METRO_PORT` through the env file. Source the env file in the same shell before curl or doctor:

```sh
eval "$(make -s env)"
. /tmp/procurely-verify/$COMPOSE_PROJECT_NAME/env.sh
```

`EXPO_PUBLIC_API_URL` is baked in at bundle time. The launch script passes it and `--clear`. Keep API URLs out of `apps/mobile/.env*`.

Teardown: see Cleanup. Do not start a second verification Metro for this checkout.

## Doctor

```sh
.claude/skills/verify-procurely/scripts/doctor.sh
```

Exit 0 only when this checkout's API is healthy, this checkout's Metro (live pid in its state dir, answering on `METRO_PORT`) answers, and `STACK_CHECKOUT` matches the current repo root. Run doctor first whenever anything looks off. Refuse to drive if doctor fails: do not click through a shared or foreign instance.

## Drive

Harness: Cursor browser tools (`cursor-ide-browser`: navigate, lock, snapshot, click by accessible name, screenshot) or, in environments that have it, `chrome-devtools-axi` as in `docs/agent-browser-verification.md`.

Stable handles are `accessibilityRole="button"` plus `accessibilityLabel` (the visible `label` unless a more specific `accessibilityLabel` is set). Snapshot uids expire after every update; take a new snapshot before each click.

If `chrome-devtools-axi open` fails with `BRIDGE_NOT_READY` (seen in WSL2), start headless Chrome yourself and attach: `chrome --headless=new --no-sandbox --remote-debugging-port=<free port> --user-data-dir=<scratch dir> about:blank &`, then `export CHROME_DEVTOOLS_AXI_SESSION=<name> CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:<port>`. Run `chrome-devtools-axi selectpage 1` in each shell before `open`; the attached tab is not selected by default. Use a named session so other workers' browsers are untouched.

1. Open `http://127.0.0.1:$METRO_PORT`. First bundle can take ~30s; wait until Sign in is visible.
2. Follow the feature file. Start from a freshly seeded database unless the file says otherwise (`pnpm db:reset` / `make seed`).
3. Prefer buttons by accessible name: `Sign in as Alice`, `Acme Trading`, `Nordic Supplies`, `Suppliers`, `Catalog`, `Sign out`.
4. Confirm company-scoped API calls when the proof needs isolation: `GET /cost-centers`, `/suppliers`, `/catalog-items` with `X-Company-Id`. Browser network tools or `curl` after a dev-login token.

HTTP side path (not a substitute for UI proof on mapped UI features):

```sh
. /tmp/procurely-verify/$COMPOSE_PROJECT_NAME/env.sh
TOKEN=$(curl -s -XPOST "http://localhost:$API_PORT/auth/dev-login" \
  -H 'content-type: application/json' \
  -d '{"personId":"00000000-0000-4000-8000-0000000000b1"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s "http://localhost:$API_PORT/me" -H "Authorization: Bearer $TOKEN"
```

Dev login exists only while the API `NODE_ENV` is `development` or `test` (compose sets that). Google sign-in is optional and is not the default verification path.

## Evidence

Directory: `.claude/skills/verify-procurely/evidence/<run-id>/` (gitignored). Create the directory before driving. `<run-id>` is a timestamp plus the feature id, e.g. `20261004T120000-sign-in-company-switch`.

Proof standards:

- Exercise the real user path in the web app (dev-login buttons), not only `curl` or test-only endpoints.
- Capture the action and the resulting state: ARIA/accessibility snapshot plus screenshot with the signed-in name and company line visible.
- For mutations, a second read of the list (or `GET` the resource) after the action.
- Record the feature id and entry point in a `PROOF.md` in that directory.

Mocks: Google OAuth may be configured in root `.env`; default proofs use seed + dev login and do not go through Google.

## Cleanup

```sh
.claude/skills/verify-procurely/scripts/cleanup.sh
```

Stops the Metro process this launch wrote to `/tmp/procurely-verify/<compose project>/metro.pid` (by pid, not by name) and `make down` for **this** checkout's compose project (keeps the database volume). Leaves `evidence/<run-id>/` in place.

In a disposable worktree that is about to be returned, run `DISPOSABLE=1 .claude/skills/verify-procurely/scripts/cleanup.sh`. After `make down` it also runs `docker compose down -v --rmi local` for this checkout's project, removing the database volume and the built image. Without it they stay, and are unreachable once the worktree path is deleted.

If this run created extra cost centers, suppliers, or catalog items and you need a clean seed for the next proof, `make seed` before the next drive, not during cleanup of evidence.

## Helpers

| Script               | Invocation                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Launch stack + Metro | `.claude/skills/verify-procurely/scripts/launch.sh`                                               |
| Readiness            | `.claude/skills/verify-procurely/scripts/doctor.sh`                                               |
| Teardown             | `.claude/skills/verify-procurely/scripts/cleanup.sh` (`DISPOSABLE=1` also drops volume and image) |
