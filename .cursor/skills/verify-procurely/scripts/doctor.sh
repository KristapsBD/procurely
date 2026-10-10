#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
eval "$(make -s env)"
STATE="/tmp/procurely-verify/$COMPOSE_PROJECT_NAME"
METRO_PORT=$((API_PORT + 20000))

if [[ "${STACK_CHECKOUT:-}" != "$ROOT" ]]; then
  echo "STACK_CHECKOUT mismatch: '${STACK_CHECKOUT:-}' vs $ROOT" >&2
  exit 1
fi

health="$(curl -sf "http://localhost:$API_PORT/health")" || {
  echo "API not healthy on $API_PORT" >&2
  exit 1
}
echo "$health" | grep -q '"status":"ok"' || {
  echo "unexpected health: $health" >&2
  exit 1
}
kill -0 "$(cat "$STATE/metro.pid" 2>/dev/null)" 2>/dev/null || {
  echo "no live Metro pid for this checkout in $STATE" >&2
  exit 1
}
curl -sf "http://127.0.0.1:$METRO_PORT" >/dev/null || {
  echo "Metro not answering on $METRO_PORT" >&2
  exit 1
}

echo "ok checkout=$ROOT project=$COMPOSE_PROJECT_NAME api=http://localhost:$API_PORT metro=http://127.0.0.1:$METRO_PORT"
