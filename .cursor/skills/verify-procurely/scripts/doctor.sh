#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
eval "$(make -s env)"
METRO_PORT=8091

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
curl -sf "http://127.0.0.1:$METRO_PORT" >/dev/null || {
  echo "Metro not answering on $METRO_PORT" >&2
  exit 1
}

echo "ok checkout=$ROOT project=$COMPOSE_PROJECT_NAME api=http://localhost:$API_PORT metro=http://127.0.0.1:$METRO_PORT"
