#!/usr/bin/env bash
# Structured logging for orchestrator

LOGS_BASE="scripts/autonomous/logs"
CURRENT_LINK="${LOGS_BASE}/current"

init_logging() {
  # Resume: if a "current" symlink exists and has status files, reuse it
  if [[ -L "$CURRENT_LINK" ]] && [[ -d "$CURRENT_LINK" ]]; then
    # Resolve symlink to real path, then back to repo-relative
    LOG_DIR="$(cd "$CURRENT_LINK" && pwd -P)"
    LOG_DIR="${LOG_DIR#"$(pwd -P)/"}"
  else
    LOG_DIR="${LOGS_BASE}/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$LOG_DIR"
    # Symlink with just the basename since both are in LOGS_BASE
    ln -sfn "$(basename "$LOG_DIR")" "$CURRENT_LINK"
  fi
  echo "$LOG_DIR"
}

log() {
  local level="$1"
  shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "${LOG_DIR}/orchestrator.log"
}

log_info()  { log "INFO" "$@"; }
log_warn()  { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

get_phase_status() {
  local phase="$1"
  local status_file="${LOG_DIR}/phase-${phase}.status"
  if [[ -f "$status_file" ]]; then
    cat "$status_file"
  else
    echo "pending"
  fi
}

set_phase_status() {
  local phase="$1"
  local status="$2"
  echo "$status" > "${LOG_DIR}/phase-${phase}.status"
}
