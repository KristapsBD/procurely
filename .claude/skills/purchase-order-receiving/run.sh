#!/usr/bin/env bash
# Model-checks PurchaseOrderReceiving.tla with TLC in Docker.
#   run.sh           check the code as it is: exits 0 only if every invariant holds
#   run.sh --broken  check that TLC catches each broken variant: exits 0 only if
#                    every variant violates an invariant
set -euo pipefail

TLA_VERSION=v1.7.4
TLA_SHA256=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88
IMAGE=eclipse-temurin:21-jre@sha256:227118764cccd3c3294617061aaa93a08309c63a395eefa83e6b35032992ea99

here=$(cd "$(dirname "$0")" && pwd)
cache="$here/.cache"
jar="tla2tools-$TLA_VERSION.jar"
mkdir -p "$cache"

if ! echo "$TLA_SHA256  $cache/$jar" | sha256sum --check --status 2>/dev/null; then
  echo "Downloading tla2tools.jar $TLA_VERSION"
  curl -fsSL -o "$cache/$jar.part" \
    "https://github.com/tlaplus/tlaplus/releases/download/$TLA_VERSION/tla2tools.jar"
  echo "$TLA_SHA256  $cache/$jar.part" | sha256sum --check --status ||
    { echo "tla2tools.jar checksum mismatch" >&2; rm -f "$cache/$jar.part"; exit 2; }
  mv "$cache/$jar.part" "$cache/$jar"
fi

# tlc <name> <switch-to-turn-off or ""> ; prints the result, returns TLC's exit code.
tlc() {
  local name=$1 off=$2 cfg="$cache/$1.cfg" log="$cache/$1.log" code=0
  sed "s/^    $off = TRUE\$/    $off = FALSE/" "$here/MC.cfg" >"$cfg"
  if [[ -n $off ]] && ! grep -q "^    $off = FALSE\$" "$cfg"; then
    echo "MC.cfg has no switch line '    $off = TRUE'" >&2
    exit 2
  fi
  docker run --rm -u "$(id -u):$(id -g)" \
    -v "$here":/spec:ro -v "$cache":/cache -w /spec "$IMAGE" \
    java -XX:+UseParallelGC -cp "/cache/$jar" tlc2.TLC \
    -workers auto -metadir /tmp/tlc -cleanup -difftrace \
    -config "/cache/$name.cfg" MC.tla >"$log" 2>&1 || code=$?
  echo "== $name (TLC exit $code, full log: $log)"
  if [[ $code -eq 0 ]]; then
    grep -E '^[0-9,]+ states generated|^Finished in' "$log"
  else
    grep -E '^Error: ' "$log" | grep -v 'The behavior up to this point' || true
    awk -f "$here/steps.awk" "$log"
  fi
  return "$code"
}

if [[ ${1:-} == --broken ]]; then
  failed=0
  for off in LineGuardLocks ClosureGuardLocks GuardReadsAfterLock LineGuardChecksClosed; do
    code=0
    tlc "broken-$off" "$off" || code=$?
    # 12 is TLC's "invariant violated"; anything else is not the catch we want.
    if [[ $code -ne 12 ]]; then
      echo "!! broken variant $off was not caught by an invariant violation" >&2
      failed=1
    fi
  done
  exit "$failed"
fi

tlc code "" # the real code, app pre-check included
tlc triggers-only AppPrecheck # the triggers alone, as for any other caller
