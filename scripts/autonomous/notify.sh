#!/usr/bin/env bash
# tva
# ntfy.sh notification helper for WRL orchestrator
set -euo pipefail

NTFY_TOPIC="${NTFY_TOPIC:-wrl-orchestrator-ben-2026}"
NTFY_URL="https://ntfy.sh/${NTFY_TOPIC}"

notify() {
  local title="$1"
  local message="$2"
  local priority="${3:-default}"
  local tags="${4:-}"

  local -a args=(
    -s -X POST "$NTFY_URL"
    -H "Title: $title"
    -H "Priority: $priority"
    -d "$message"
  )

  if [[ -n "$tags" ]]; then
    args+=(-H "Tags: $tags")
  fi

  curl "${args[@]}" > /dev/null 2>&1 || true
}

notify_phase_complete() {
  local phase="$1"
  local title="$2"
  local pr="${3:-}"
  notify "Phase ${phase} complete" "${title}. PR #${pr} merged. Pausing 30min."
}

notify_act_complete() {
  local act="$1"
  local count="$2"
  notify "Act ${act} COMPLETE" "${count} phases done. Waiting for GO signal. Touch ~/wrl-go to continue." "high" "tada"
}

notify_error() {
  local phase="$1"
  local message="$2"
  notify "PHASE FAILED: ${phase}" "$message" "urgent" "warning"
}

notify_started() {
  local phase="$1"
  local title="$2"
  notify "Phase ${phase} starting" "$title" "low" "hourglass"
}

# Allow sourcing or direct invocation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    phase-complete) shift; notify_phase_complete "$@" ;;
    act-complete) shift; notify_act_complete "$@" ;;
    error) shift; notify_error "$@" ;;
    started) shift; notify_started "$@" ;;
    *) notify "$@" ;;
  esac
fi
