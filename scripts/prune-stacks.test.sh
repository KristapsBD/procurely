#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
unset STACK_CHECKOUT COMPOSE_PROJECT_NAME API_PORT DB_PORT DATABASE_URL DIRECT_URL APPLY PRUNE_PROJECTS

if ! docker info >/dev/null 2>&1; then
  printf 'docker is not available\n' >&2
  exit 1
fi

before=$(mktemp -d /tmp/procurely-prune-snap-XXXXXX)
docker ps -a --format '{{.Names}}' | sort > "$before/containers"
docker volume ls -q | sort > "$before/volumes"
docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$before/images"
docker network ls --format '{{.Name}}' | sort > "$before/networks"

root=$(mktemp -d /tmp/procurely-prune-XXXXXX)
created=()

remove_if_new() {
  local kind=$1 name=$2 snapshot=$3
  if grep -Fqx "$name" "$snapshot"; then
    return 0
  fi
  case "$kind" in
    container)
      docker stop -t 1 "$name" >/dev/null 2>&1 || true
      docker rm "$name" >/dev/null 2>&1 || true
      ;;
    volume) docker volume rm "$name" >/dev/null 2>&1 || true ;;
    image) docker image rm "$name" >/dev/null 2>&1 || true ;;
    network) docker network rm "$name" >/dev/null 2>&1 || true ;;
  esac
}

cleanup() {
  set +e
  local project
  for project in "${created[@]}"; do
    remove_if_new container "${project}-app-1" "$before/containers"
    remove_if_new volume "${project}_pgdata" "$before/volumes"
    remove_if_new image "${project}-app:latest" "$before/images"
    remove_if_new network "${project}_default" "$before/networks"
  done
  case "$root" in
    /tmp/procurely-prune-*) rm -rf "$root" ;;
  esac
  rm -rf "$before"
}
trap cleanup EXIT

assert_kept() {
  local kind gone
  docker ps -a --format '{{.Names}}' | sort > "$before/now-containers"
  docker volume ls -q | sort > "$before/now-volumes"
  docker images --format '{{.Repository}}:{{.Tag}}' | sort > "$before/now-images"
  docker network ls --format '{{.Name}}' | sort > "$before/now-networks"
  for kind in containers volumes images networks; do
    gone=$(comm -23 "$before/$kind" "$before/now-$kind" || true)
    if [[ -n "$gone" ]]; then
      printf 'pre-existing %s disappeared:\n%s\n' "$kind" "$gone" >&2
      exit 1
    fi
  done
}

require_line() {
  local file=$1 line=$2
  if ! grep -Fqx "$line" "$file"; then
    printf 'missing line: %s\n' "$line" >&2
    cat "$file" >&2
    exit 1
  fi
}

refuse_line() {
  local file=$1 line=$2
  if grep -Fqx "$line" "$file"; then
    printf 'unexpected line: %s\n' "$line" >&2
    cat "$file" >&2
    exit 1
  fi
}

section() {
  local kind=$1 project=$2 file=$3
  awk -v kind="$kind" -v project="$project" '
    $1 == kind && $2 == project { on = 1; next }
    on && ($1 == "candidate" || $1 == "running" || $1 == "removed") { exit }
    on && NF { print }
  ' "$file"
}

require_reason() {
  local file=$1 project=$2 reason=$3 sec
  sec=$(section candidate "$project" "$file")
  if ! printf '%s\n' "$sec" | grep -Fqx "reason: $reason"; then
    printf 'project %s missing reason: %s\n%s\n' "$project" "$reason" "$sec" >&2
    exit 1
  fi
  if ! printf '%s\n' "$sec" | grep -Fqx "container: ${project}-app-1"; then
    printf 'project %s missing container\n%s\n' "$project" "$sec" >&2
    exit 1
  fi
  if ! printf '%s\n' "$sec" | grep -Fqx "volume: ${project}_pgdata"; then
    printf 'project %s missing volume\n%s\n' "$project" "$sec" >&2
    exit 1
  fi
  if ! printf '%s\n' "$sec" | grep -Fqx "image: ${project}-app:latest"; then
    printf 'project %s missing image\n%s\n' "$project" "$sec" >&2
    exit 1
  fi
}

help_out=$(make help)
if ! printf '%s\n' "$help_out" | grep -q 'make prune'; then
  printf 'make help does not list prune:\n%s\n' "$help_out" >&2
  exit 1
fi

stack_id=$(printf '%s' "$PWD" | cksum | cut -d' ' -f1)
eval "$(make -s env)"
if [[ "$COMPOSE_PROJECT_NAME" != "procurely-$stack_id" ]]; then
  printf 'checkout project is %s, want procurely-%s\n' "$COMPOSE_PROJECT_NAME" "$stack_id" >&2
  exit 1
fi
current=$COMPOSE_PROJECT_NAME

sid=$(printf '%s' "$$$(date +%s)" | cksum | cut -d' ' -f1)
stopped="procurely-pt${sid}s"
gone="procurely-pt${sid}g"
running="procurely-pt${sid}r"
outsider="zzpt${sid}"

project_busy() {
  local project=$1
  if grep -Fqx "${project}-app-1" "$before/containers"; then
    return 0
  fi
  if grep -Fqx "${project}_pgdata" "$before/volumes"; then
    return 0
  fi
  if grep -Fqx "${project}-app:latest" "$before/images"; then
    return 0
  fi
  [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${project}")" ]] && return 0
  [[ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")" ]] && return 0
  [[ -n "$(docker images -q --filter "label=com.docker.compose.project=${project}")" ]] && return 0
  return 1
}

bring_up() {
  local project=$1 dir=$2
  mkdir -p "$dir"
  printf 'FROM postgres:17\n' > "$dir/Dockerfile"
  cat > "$dir/compose.yml" <<EOF
services:
  app:
    build: .
    image: ${project}-app:latest
    entrypoint: ["sleep", "infinity"]
    volumes:
      - pgdata:/data
volumes:
  pgdata:
EOF
  created+=("$project")
  docker compose -f "$dir/compose.yml" -p "$project" up -d --build --pull never
  local actual_wd
  actual_wd=$(docker inspect "${project}-app-1" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
  if [[ "$actual_wd" != "$dir" ]]; then
    printf 'workdir for %s is %s, want %s\n' "$project" "$actual_wd" "$dir" >&2
    exit 1
  fi
}

stop_project() {
  local project=$1 dir=$2
  docker compose -f "$dir/compose.yml" -p "$project" stop
}

bring_up "$stopped" "$root/stopped"
stop_project "$stopped" "$root/stopped"
bring_up "$gone" "$root/gone"
stop_project "$gone" "$root/gone"
rm -rf "$root/gone"
bring_up "$running" "$root/running"
bring_up "$outsider" "$root/outsider"
stop_project "$outsider" "$root/outsider"

legacy=0
if project_busy procurely; then
  printf 'legacy fixture skipped: a procurely project already exists\n'
else
  legacy=1
  bring_up procurely "$root/legacy"
  stop_project procurely "$root/legacy"
fi

current_fixture=0
if project_busy "$current"; then
  printf 'current checkout fixture skipped: %s already exists\n' "$current"
else
  current_fixture=1
  bring_up "$current" "$root/current"
  stop_project "$current" "$root/current"
fi

ours="$stopped,$gone,$running,$current,$outsider"
if [[ "$legacy" -eq 1 ]]; then
  ours="$ours,procurely"
fi

dry=$(mktemp)
make prune > "$dry"
if grep -q '^removed ' "$dry"; then
  printf 'dry run printed a removal:\n' >&2
  cat "$dry" >&2
  exit 1
fi
require_reason "$dry" "$stopped" "stopped"
require_reason "$dry" "$gone" "working folder no longer exists"
refuse_line "$dry" "candidate $running"
require_line "$dry" "running $running"
require_line "$dry" "skipped: running"
refuse_line "$dry" "candidate $current"
refuse_line "$dry" "candidate $outsider"
refuse_line "$dry" "running $outsider"
if [[ "$legacy" -eq 1 ]]; then
  require_reason "$dry" "procurely" "old default project procurely"
fi
docker inspect "${stopped}-app-1" >/dev/null
docker inspect "${gone}-app-1" >/dev/null
docker inspect "${running}-app-1" >/dev/null
assert_kept

scoped=$(mktemp)
PRUNE_PROJECTS="$ours" make prune > "$scoped"
if grep -q '^removed ' "$scoped"; then
  printf 'scoped dry run printed a removal:\n' >&2
  cat "$scoped" >&2
  exit 1
fi
require_reason "$scoped" "$stopped" "stopped"
require_reason "$scoped" "$gone" "working folder no longer exists"
refuse_line "$scoped" "candidate $running"
require_line "$scoped" "running $running"
refuse_line "$scoped" "candidate $current"
refuse_line "$scoped" "running $current"
refuse_line "$scoped" "candidate $outsider"
while IFS= read -r listed; do
  [[ -n "$listed" ]] || continue
  case "$listed" in
    "$stopped" | "$gone" | "$running") ;;
    procurely)
      if [[ "$legacy" -ne 1 ]]; then
        printf 'scoped prune listed procurely without the test creating it\n' >&2
        exit 1
      fi
      ;;
    *)
      printf 'scoped prune listed an unexpected project: %s\n' "$listed" >&2
      cat "$scoped" >&2
      exit 1
      ;;
  esac
done < <(awk '$1 == "candidate" || $1 == "running" { print $2 }' "$scoped")

applied=$(mktemp)
PRUNE_PROJECTS="$ours" make prune APPLY=1 > "$applied"
require_line "$applied" "removed container ${stopped}-app-1"
require_line "$applied" "removed volume ${stopped}_pgdata"
require_line "$applied" "removed image ${stopped}-app:latest"
require_line "$applied" "removed container ${gone}-app-1"
require_line "$applied" "removed volume ${gone}_pgdata"
require_line "$applied" "removed image ${gone}-app:latest"
if [[ "$legacy" -eq 1 ]]; then
  require_line "$applied" "removed container procurely-app-1"
  require_line "$applied" "removed volume procurely_pgdata"
  require_line "$applied" "removed image procurely-app:latest"
fi
refuse_line "$applied" "removed container ${running}-app-1"
refuse_line "$applied" "removed volume ${running}_pgdata"
refuse_line "$applied" "removed image ${running}-app:latest"
refuse_line "$applied" "removed container ${current}-app-1"
refuse_line "$applied" "removed volume ${current}_pgdata"
refuse_line "$applied" "removed image ${current}-app:latest"
refuse_line "$applied" "removed container ${outsider}-app-1"
refuse_line "$applied" "removed volume ${outsider}_pgdata"
refuse_line "$applied" "removed image ${outsider}-app:latest"
if docker inspect "${stopped}-app-1" >/dev/null 2>&1; then
  printf 'stopped candidate still exists after APPLY=1\n' >&2
  exit 1
fi
if docker inspect "${gone}-app-1" >/dev/null 2>&1; then
  printf 'missing-folder candidate still exists after APPLY=1\n' >&2
  exit 1
fi
docker inspect "${running}-app-1" >/dev/null
docker inspect "${outsider}-app-1" >/dev/null
if [[ "$current_fixture" -eq 1 ]]; then
  docker inspect "${current}-app-1" >/dev/null
fi
assert_kept

again=$(mktemp)
PRUNE_PROJECTS="$ours" make prune APPLY=1 > "$again"
if grep -q "^removed container ${stopped}-app-1\$" "$again"; then
  printf 'second APPLY removed the stopped candidate again\n' >&2
  exit 1
fi
refuse_line "$again" "candidate $stopped"
docker inspect "${running}-app-1" >/dev/null
assert_kept

printf 'prune test passed\n'
printf 'dry run listed candidates and removed nothing\n'
printf 'APPLY=1 removed the stopped, missing-folder'
if [[ "$legacy" -eq 1 ]]; then
  printf ', and old-default'
fi
printf ' candidates\n'
printf 'running stack kept\n'
printf 'current checkout stack kept\n'
printf 'outsider project kept\n'
printf 'pre-existing docker resources kept\n'
