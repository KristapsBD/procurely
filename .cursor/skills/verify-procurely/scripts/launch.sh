#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
STATE=/tmp/procurely-verify
mkdir -p "$STATE"
METRO_PORT=8091

if [[ ! -d node_modules ]]; then
  pnpm install
fi

make up
make seed
eval "$(make -s env)"
printf '%s\n' "export STACK_CHECKOUT='$STACK_CHECKOUT' COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME API_PORT=$API_PORT DB_PORT=$DB_PORT DATABASE_URL='$DATABASE_URL' DIRECT_URL='$DIRECT_URL' METRO_PORT=$METRO_PORT EXPO_PUBLIC_API_URL=http://localhost:$API_PORT" >"$STATE/env.sh"

if [[ -f "$STATE/metro.pid" ]] && kill -0 "$(cat "$STATE/metro.pid")" 2>/dev/null; then
  echo "Metro already running pid $(cat "$STATE/metro.pid")"
else
  EXPO_PUBLIC_API_URL="http://localhost:$API_PORT" CI=1 pnpm --filter @procurely/mobile exec expo start --web --port "$METRO_PORT" --clear \
    >"$STATE/metro.log" 2>&1 &
  echo $! >"$STATE/metro.pid"
fi

for i in $(seq 1 90); do
  if curl -sf "http://localhost:$API_PORT/health" >/dev/null && curl -sf "http://127.0.0.1:$METRO_PORT" >/dev/null; then
    echo "ready API_PORT=$API_PORT METRO_PORT=$METRO_PORT"
    exit 0
  fi
  sleep 2
done
echo "launch timed out; see $STATE/metro.log" >&2
exit 1
