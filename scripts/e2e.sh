#!/usr/bin/env bash
# Runs the saved Maestro flows in e2e/maestro against this checkout's stack, in headless Chromium
# against the Expo web target. Starts the stack and Metro, reseeds, then runs the flows.
# Extra arguments are passed to `maestro test` (default: every flow in e2e/maestro).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v maestro >/dev/null 2>&1 && [[ -x "$HOME/.maestro/maestro/bin/maestro" ]]; then
  export PATH="$HOME/.maestro/maestro/bin:$PATH"
fi
if ! command -v java >/dev/null 2>&1 && [[ -x "$HOME/Android/jdk17/bin/java" ]]; then
  export JAVA_HOME="$HOME/Android/jdk17" PATH="$HOME/Android/jdk17/bin:$PATH"
fi
for tool in maestro java; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "$tool not found. Run scripts/install-maestro.sh (see docs/android-emulator.md)." >&2
    exit 1
  }
done
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true

"$ROOT/.claude/skills/verify-procurely/scripts/launch.sh"
eval "$(make -s env)"
# shellcheck disable=SC1090
. "/tmp/procurely-verify/$COMPOSE_PROJECT_NAME/env.sh"
"$ROOT/.claude/skills/verify-procurely/scripts/doctor.sh"

if [[ $# -eq 0 ]]; then set -- e2e/maestro; fi
exec maestro test --headless --screen-size 1280x2400 -e "APP_URL=http://127.0.0.1:$METRO_PORT" "$@"
