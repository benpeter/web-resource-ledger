#!/usr/bin/env bash
# Structured logging for orchestrator

LOG_DIR="${LOG_DIR:-scripts/autonomous/logs/$(date +%Y%m%d-%H%M%S)}"

init_logging() {
  mkdir -p "$LOG_DIR"
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
