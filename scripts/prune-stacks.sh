#!/usr/bin/env bash
# Lists leftover procurely stacks (dry run); APPLY=1 removes them.
# A leftover is a Compose project named procurely or procurely-<digits> that owns a volume,
# is not this checkout's project, and has no running container.
set -euo pipefail

cur=${COMPOSE_PROJECT_NAME:?run via make prune}
label=com.docker.compose.project
found=0

for p in $(docker volume ls -q --filter "label=$label" --format "{{.Label \"$label\"}}" |
  sort -u | grep -E '^procurely(-[0-9]+)?$' || true); do
  [[ $p == "$cur" ]] && continue
  if [[ -n $(docker ps -q --filter "label=$label=$p" --filter status=running) ]]; then
    echo "skip (running): $p"
    continue
  fi
  found=1
  if [[ ${APPLY:-} != 1 ]]; then
    echo "leftover: $p"
    continue
  fi
  echo "removing: $p"
  docker compose -p "$p" down -v --rmi local
  # Without a compose file, --rmi local cannot find the built image; remove it by label.
  images=$(docker image ls -q --filter "label=$label=$p")
  [[ -z $images ]] || docker image rm $images
done

if [[ $found == 0 ]]; then
  echo "no leftover procurely stacks"
elif [[ ${APPLY:-} != 1 ]]; then
  echo "dry run: make prune APPLY=1 removes the leftovers (containers, volumes, network, built image)"
fi
