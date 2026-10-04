#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]]; then
  printf 'COMPOSE_PROJECT_NAME is not set. Run make prune from a checkout.\n' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf 'docker is not available\n' >&2
  exit 1
fi

apply=0
if [[ "${APPLY:-}" == "1" ]]; then
  apply=1
elif [[ -n "${APPLY:-}" ]]; then
  printf 'APPLY=%s is not 1, so this is a dry run.\n' "$APPLY" >&2
fi

procurely_name() {
  local name=$1
  [[ "$name" == "procurely" || "$name" == procurely-* ]]
}

# Set only by the test. It narrows the scan to named projects so APPLY=1
# on a shared daemon cannot remove stacks the test did not create.
# It cannot widen the scan: names outside procurely / procurely-* are ignored.
declare -A allow=()
restrict=0
if [[ -n "${PRUNE_PROJECTS:-}" ]]; then
  restrict=1
  IFS=',' read -ra prune_parts <<< "$PRUNE_PROJECTS"
  for part in "${prune_parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    if procurely_name "$part"; then
      allow["$part"]=1
    fi
  done
fi

declare -A seen=()
declare -A containers=()
declare -A volumes=()
declare -A images=()
declare -A is_running=()
declare -A dir_missing=()

wanted() {
  local project=$1
  procurely_name "$project" || return 1
  if [[ "$restrict" -eq 1 && -z "${allow[$project]:-}" ]]; then
    return 1
  fi
}

classify() {
  local project=$1
  if [[ "$project" == "$COMPOSE_PROJECT_NAME" ]]; then
    printf 'current\n'
    return
  fi
  if [[ -n "${is_running[$project]:-}" ]]; then
    printf 'running\n'
    return
  fi
  if [[ -n "${dir_missing[$project]:-}" ]]; then
    printf 'missing\n'
    return
  fi
  if [[ "$project" == "procurely" ]]; then
    printf 'legacy\n'
    return
  fi
  printf 'stopped\n'
}

reason_text() {
  case "$1" in
    missing) printf 'working folder no longer exists\n' ;;
    legacy) printf 'old default project procurely\n' ;;
    stopped) printf 'stopped\n' ;;
    *)
      printf 'unknown reason %s\n' "$1" >&2
      exit 1
      ;;
  esac
}

sorted_names() {
  printf '%s' "$1" | sed '/^$/d' | sort -u
}

print_names() {
  local label=$1 blob=$2 line
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '%s: %s\n' "$label" "$line"
  done < <(sorted_names "$blob")
}

remove_names() {
  local kind=$1 blob=$2 line
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    case "$kind" in
      container) docker rm "$line" >/dev/null ;;
      volume) docker volume rm "$line" >/dev/null ;;
      image) docker image rm "$line" >/dev/null ;;
      *)
        printf 'unknown resource %s\n' "$kind" >&2
        exit 1
        ;;
    esac
    printf 'removed %s %s\n' "$kind" "$line"
  done < <(sorted_names "$blob")
}

collect_containers() {
  local project name state workdir
  while IFS=$'\t' read -r project name state workdir; do
    [[ -n "$project" && "$project" != "<no value>" ]] || continue
    wanted "$project" || continue
    seen["$project"]=1
    containers["$project"]+="${name}"$'\n'
    case "$state" in
      running | restarting) is_running["$project"]=1 ;;
    esac
    if [[ -n "$workdir" && "$workdir" != "<no value>" && ! -d "$workdir" ]]; then
      dir_missing["$project"]=1
    fi
  done < <(docker ps -a --filter label=com.docker.compose.project --format '{{.Label "com.docker.compose.project"}}{{"\t"}}{{.Names}}{{"\t"}}{{.State}}{{"\t"}}{{.Label "com.docker.compose.project.working_dir"}}')
}

collect_volumes() {
  local names=() project volume
  mapfile -t names < <(docker volume ls -q --filter label=com.docker.compose.project | sort -u)
  [[ ${#names[@]} -gt 0 ]] || return 0
  while IFS=$'\t' read -r project volume; do
    [[ -n "$project" && "$project" != "<no value>" ]] || continue
    wanted "$project" || continue
    seen["$project"]=1
    volumes["$project"]+="${volume}"$'\n'
  done < <(docker volume inspect "${names[@]}" --format '{{index .Labels "com.docker.compose.project"}}{{"\t"}}{{.Name}}')
}

collect_images() {
  local ids=() project id tags tag repo
  mapfile -t ids < <(docker images -q --filter label=com.docker.compose.project | sort -u)
  [[ ${#ids[@]} -gt 0 ]] || return 0
  while IFS=$'\t' read -r project id tags; do
    [[ -n "$project" && "$project" != "<no value>" ]] || continue
    wanted "$project" || continue
    seen["$project"]=1
    # Keep a tag only when its repository is procurely or procurely-*.
    # The database container's postgres image is shared and stays.
    if [[ -n "${tags//[[:space:]]/}" ]]; then
      read -ra tag_arr <<< "$tags"
      for tag in "${tag_arr[@]}"; do
        repo="${tag%%:*}"
        if procurely_name "$repo"; then
          images["$project"]+="${tag}"$'\n'
        fi
      done
    else
      images["$project"]+="${id}"$'\n'
    fi
  done < <(docker image inspect "${ids[@]}" --format '{{index .Config.Labels "com.docker.compose.project"}}{{"\t"}}{{.Id}}{{"\t"}}{{range $i, $t := .RepoTags}}{{if $i}} {{end}}{{$t}}{{end}}')
}

collect_containers
collect_volumes
collect_images

candidates=()
running_projects=()
declare -A reason=()

if [[ ${#seen[@]} -gt 0 ]]; then
  while IFS= read -r project; do
    [[ -n "$project" ]] || continue
    kind=$(classify "$project")
    case "$kind" in
      current) ;;
      running) running_projects+=("$project") ;;
      missing | legacy | stopped)
        candidates+=("$project")
        reason["$project"]=$kind
        ;;
      *)
        printf 'unknown class %s\n' "$kind" >&2
        exit 1
        ;;
    esac
  done < <(printf '%s\n' "${!seen[@]}" | sort)
fi

for project in "${candidates[@]}"; do
  printf 'candidate %s\n' "$project"
  printf 'reason: %s\n' "$(reason_text "${reason[$project]}")"
  print_names container "${containers[$project]:-}"
  print_names volume "${volumes[$project]:-}"
  print_names image "${images[$project]:-}"
  printf '\n'
done

for project in "${running_projects[@]}"; do
  printf 'running %s\n' "$project"
  printf 'skipped: running\n'
  print_names container "${containers[$project]:-}"
  print_names volume "${volumes[$project]:-}"
  print_names image "${images[$project]:-}"
  printf '\n'
done

if [[ ${#candidates[@]} -eq 0 && ${#running_projects[@]} -eq 0 ]]; then
  printf 'no stray stacks\n'
fi

if [[ "$apply" -eq 1 ]]; then
  for project in "${candidates[@]}"; do
    remove_names container "${containers[$project]:-}"
    remove_names volume "${volumes[$project]:-}"
    remove_names image "${images[$project]:-}"
  done
fi
