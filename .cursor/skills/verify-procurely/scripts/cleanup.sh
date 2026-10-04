#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT"
STATE=/tmp/procurely-verify

kill_tree() {
  local pid=$1
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

if [[ -f "$STATE/metro.pid" ]]; then
  pid="$(cat "$STATE/metro.pid")"
  kill_tree "$pid"
  sleep 1
  kill_tree "$pid"
  rm -f "$STATE/metro.pid"
fi

make down
echo "cleanup done (evidence directories left in place)"
