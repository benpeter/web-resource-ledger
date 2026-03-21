#!/usr/bin/env bash
# Wait for user GO signal via flag file

SIGNAL_FILE="${HOME}/wrl-go"

wait_for_signal() {
  local timeout="${1:-0}"  # 0 = wait forever
  local elapsed=0

  log_info "Waiting for GO signal (touch ${SIGNAL_FILE})"

  while true; do
    if [[ -f "$SIGNAL_FILE" ]]; then
      rm -f "$SIGNAL_FILE"
      log_info "GO signal received"
      return 0
    fi

    if [[ "$timeout" -gt 0 ]] && [[ "$elapsed" -ge "$timeout" ]]; then
      log_info "Wait timeout after ${elapsed}s, proceeding"
      return 0
    fi

    sleep 30
    elapsed=$((elapsed + 30))
  done
}
