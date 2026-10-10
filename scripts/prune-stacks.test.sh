#!/usr/bin/env bash
# Runs prune-stacks.sh against a stubbed docker. Touches no real Docker state.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export CALLS=$tmp/calls PROJECTS=$tmp/projects

cat > "$tmp/docker" <<'S'
#!/usr/bin/env bash
echo "$*" >> "$CALLS"
case "$1 $2" in
  "volume ls") cat "$PROJECTS" ;;
  "ps -q") [[ "$*" == *"label=com.docker.compose.project=procurely-2 "* ]] && echo abc123 || true ;;
  "image ls") echo "img-${5#label=com.docker.compose.project=}" ;;
esac
S
chmod +x "$tmp/docker"
export PATH=$tmp:$PATH COMPOSE_PROJECT_NAME=procurely-1

run() { env "$@" bash "$here/prune-stacks.sh" > "$tmp/out" 2>&1; mv "$CALLS" "$CALLS.last"; : > "$CALLS"; }
fail() { echo "FAIL: $1" >&2; cat "$tmp/out" "$CALLS.last" >&2; exit 1; }

printf '%s\n' procurely-1 procurely-2 procurely-3 procurely procurelyx foo procurely-x > "$PROJECTS"

run APPLY=
grep -q '^compose' "$CALLS.last" && fail "dry run ran compose"
grep -q '^image rm' "$CALLS.last" && fail "dry run removed an image"
grep -qx 'leftover: procurely-3' "$tmp/out" || fail "dry run missed procurely-3"

run APPLY=1
grep -qx 'compose -p procurely-3 down -v --rmi local' "$CALLS.last" || fail "orphan procurely-3 not removed"
grep -qx 'compose -p procurely down -v --rmi local' "$CALLS.last" || fail "orphan procurely not removed"
grep -qx 'image rm img-procurely-3' "$CALLS.last" || fail "orphan image not removed"
[[ $(grep -c '^compose' "$CALLS.last") == 2 ]] || fail "acted on something other than the two orphans"
grep -Eq 'procurely-1|procurely-2|procurelyx|foo|procurely-x' <(grep -E '^(compose|image rm)' "$CALLS.last") && fail "touched current, running or foreign name"

: > "$PROJECTS"
run APPLY=1
grep -qx 'no leftover procurely stacks' "$tmp/out" || fail "empty list message missing"
grep -q '^compose' "$CALLS.last" && fail "empty list ran compose"
echo "prune-stacks: ok"
