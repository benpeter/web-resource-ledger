#!/usr/bin/env bash
# tva
# WRL Autonomous Orchestrator
# Drives nefario sessions sequentially, with ntfy notifications and pacing.
# Run from a Claude Code supervisor session for monitoring capability.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
PROMPT_TEMPLATE="$SCRIPT_DIR/session-prompt.md"

# Source environment
if [[ -f ~/.wrlprofile ]]; then
  # shellcheck source=/dev/null
  source ~/.wrlprofile
fi
if [[ -f ~/.secrets ]]; then
  # shellcheck source=/dev/null
  source ~/.secrets
fi

# Source libraries
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/log.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/notify.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/verify-phase.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/wait-for-signal.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/cleanup-worktrees.sh"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/lib/fix-deploy.sh"

# Initialize logging
LOG_DIR=$(init_logging)
log_info "Orchestrator starting. Logs: $LOG_DIR"
log_info "Repo: $REPO_DIR"

# Configuration
PAUSE_BETWEEN_PHASES="${PAUSE_BETWEEN_PHASES:-1800}"  # 30 minutes
CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"
INBOX="${HOME}/wrl-inbox"

cd "$REPO_DIR"

# Read manifest
PHASE_COUNT=$(jq '.phases | length' "$MANIFEST")
log_info "Manifest loaded: $PHASE_COUNT phases"

# Read prompt template
PROMPT_BASE=$(cat "$PROMPT_TEMPLATE")

# --- Helper: process inbox messages ---
process_inbox() {
  if [[ ! -f "$INBOX" ]]; then
    return 0
  fi

  log_info "Inbox message found, processing..."
  local inbox_content
  inbox_content=$(cat "$INBOX")
  rm -f "$INBOX"

  # Build state summary
  local completed="" failed=""
  for f in "${LOG_DIR}"/phase-*.status; do
    [[ -f "$f" ]] || continue
    local p s
    p=$(basename "$f" .status | sed 's/phase-//')
    s=$(cat "$f")
    if [[ "$s" == "success" ]]; then
      completed="${completed}${p} "
    elif [[ "$s" != "pending" && "$s" != "in_progress" ]]; then
      failed="${failed}${p}(${s}) "
    fi
  done

  local inbox_prompt
  inbox_prompt="You are the WRL orchestrator assistant. The orchestrator
is between phases in ${REPO_DIR}.
Completed: ${completed:-none}
Failed: ${failed:-none}
Log dir: ${LOG_DIR}

The operator says:
${inbox_content}

Do what they ask. You can edit files, run commands, provision resources,
adjust the manifest, reset status files in ${LOG_DIR}, etc."

  claude --print \
    --dangerously-skip-permissions \
    --model sonnet \
    --max-budget-usd 5 \
    -p "$inbox_prompt" \
    > "${LOG_DIR}/inbox-$(date +%H%M%S).log" 2>&1 || {
    log_warn "Inbox session failed (non-blocking)"
  }
  notify "Inbox processed" "Message handled between phases" "low" "mailbox"
  log_info "Inbox message processed"
}

# Main loop
for i in $(seq 0 $((PHASE_COUNT - 1))); do
  PHASE=$(jq -r ".phases[$i].phase" "$MANIFEST")
  ITEM=$(jq -r ".phases[$i].item" "$MANIFEST")
  ISSUE=$(jq -r ".phases[$i].issue // empty" "$MANIFEST")
  TITLE=$(jq -r ".phases[$i].title" "$MANIFEST")
  ACT=$(jq -r ".phases[$i].act" "$MANIFEST")
  BUDGET=$(jq -r ".phases[$i].budget_usd" "$MANIFEST")
  ACT_LAST=$(jq -r ".phases[$i].act_last" "$MANIFEST")

  # --- Pre-phase checks ---

  # Pause signal: halt until operator clears it
  if [[ -f "${HOME}/wrl-pause" ]]; then
    log_info "Pause signal detected. Waiting for GO..."
    notify "Orchestrator PAUSED" "Intervention needed. Remove ~/wrl-pause and touch ~/wrl-go to resume." "urgent" "stop_sign"
    wait_for_signal
    rm -f "${HOME}/wrl-pause"
  fi

  # Process inbox messages
  process_inbox

  # Check if already done
  STATUS=$(get_phase_status "$PHASE")
  if [[ "$STATUS" == "success" ]]; then
    log_info "Phase $PHASE ($TITLE): already done, skipping"
    continue
  fi

  # Check dependencies
  DEPS=$(jq -r ".phases[$i].depends_on[]?" "$MANIFEST")
  DEPS_MET=true
  for dep in $DEPS; do
    DEP_STATUS=$(get_phase_status "$dep")
    if [[ "$DEP_STATUS" != "success" ]]; then
      log_warn "Phase $PHASE: dependency $dep not met (status: $DEP_STATUS)"
      DEPS_MET=false
    fi
  done

  if [[ "$DEPS_MET" != "true" ]]; then
    log_warn "Phase $PHASE ($TITLE): skipping due to unmet dependencies"
    set_phase_status "$PHASE" "skipped_deps"
    continue
  fi

  # --- Run phase ---

  echo ""
  echo "=========================================="
  log_info "Phase $((i+1))/$PHASE_COUNT: $PHASE - $TITLE (Act $ACT)"
  log_info "Budget: \$$BUDGET | Issue: ${ISSUE:-TBD}"
  echo "=========================================="

  # Ensure main is up-to-date (stash if dirty to avoid silent checkout failure)
  if ! git diff --quiet HEAD 2>/dev/null; then
    log_warn "Dirty working tree detected -- stashing before checkout"
    git stash push -m "orchestrator-auto-stash-phase-${PHASE}" --quiet
  fi
  git checkout main --quiet 2>/dev/null || {
    log_error "Failed to checkout main"
    exit 1
  }
  git pull --quiet --rebase 2>/dev/null || true

  # Notify start
  notify_started "$PHASE" "$TITLE"

  # Build session prompt
  ISSUE_CONTEXT=""
  if [[ -n "$ISSUE" ]] && [[ "$ISSUE" != "null" ]]; then
    ISSUE_CONTEXT=$(gh issue view "$ISSUE" --json body --jq '.body' 2>/dev/null || echo "")
  fi

  # Inject phase number into prompt template
  PROMPT_WITH_PHASE="${PROMPT_BASE//\{\{PHASE\}\}/$PHASE}"

  SESSION_PROMPT="${PROMPT_WITH_PHASE}

### Issue Context

${ISSUE_CONTEXT:-No issue body available. Refer to the issue title and manifest for scope.}
"

  # Run claude session
  PHASE_OUTPUT="${LOG_DIR}/phase-${PHASE}.json"
  PHASE_LOG="${LOG_DIR}/phase-${PHASE}.log"
  set_phase_status "$PHASE" "in_progress"

  log_info "Starting claude session..."
  if claude \
    --print \
    --dangerously-skip-permissions \
    --worktree \
    --model "$CLAUDE_MODEL" \
    --max-budget-usd "$BUDGET" \
    --output-format json \
    --append-system-prompt "$SESSION_PROMPT" \
    -p "/nefario #${ISSUE:-$TITLE}" \
    > "$PHASE_OUTPUT" 2>"$PHASE_LOG"; then

    log_info "Claude session completed"
  else
    EXIT_CODE=$?
    log_error "Claude session exited with code $EXIT_CODE"

    # Check for autonomous error signal
    if grep -q "AUTONOMOUS_ERROR:" "$PHASE_OUTPUT" 2>/dev/null; then
      ERROR_MSG=$(grep "AUTONOMOUS_ERROR:" "$PHASE_OUTPUT" | head -1)
      log_error "Autonomous error: $ERROR_MSG"
    fi

    set_phase_status "$PHASE" "failed_session"
  fi

  # --- Post-session verification (only if session succeeded) ---

  PR_NUMBER=""
  if [[ "$(get_phase_status "$PHASE")" != "failed_session" ]]; then
    PR_NUMBER=$(extract_pr_number "$PHASE_OUTPUT" 2>/dev/null || true)

    if [[ -z "$PR_NUMBER" ]]; then
      log_error "No PR found for phase $PHASE"
      set_phase_status "$PHASE" "failed_no_pr"
    fi
  fi

  # Verify and merge (only if we have a PR)
  if [[ -n "$PR_NUMBER" ]]; then
    log_info "PR #${PR_NUMBER} created"

    if verify_and_merge "$PR_NUMBER" "$PHASE" "false"; then
      set_phase_status "$PHASE" "success"
      log_info "Phase $PHASE complete!"
      notify_phase_complete "$PHASE" "$TITLE" "$PR_NUMBER"

      # Verify evolution log completeness (check after merge, when files are on main)
      git pull --quiet --rebase 2>/dev/null || true
      EVO_DIR=$(find docs/evolution -maxdepth 1 -name "${PHASE}-*" -type d 2>/dev/null | head -1)
      if [[ -z "$EVO_DIR" ]]; then
        log_warn "Phase $PHASE: no evolution log directory found"
      else
        MISSING_DOCS=()
        for doc in prompt.md decisions.md outcome.md process.md; do
          if [[ ! -f "$EVO_DIR/$doc" ]]; then
            MISSING_DOCS+=("$doc")
          fi
        done
        if [[ ${#MISSING_DOCS[@]} -gt 0 ]]; then
          log_warn "Phase $PHASE: missing evolution log files: ${MISSING_DOCS[*]}"
        fi
      fi
    else
      VERIFY_EXIT=$?
      case $VERIFY_EXIT in
        1) set_phase_status "$PHASE" "failed_ci" ;;
        2) set_phase_status "$PHASE" "failed_merge" ;;
        3) set_phase_status "$PHASE" "failed_deploy" ;;
        *) set_phase_status "$PHASE" "failed_verify" ;;
      esac
    fi
  fi

  # --- On failure: pause and hand off to supervisor ---

  if [[ "$(get_phase_status "$PHASE")" != "success" ]]; then
    FINAL_STATUS=$(get_phase_status "$PHASE")
    log_error "Phase $PHASE failed ($FINAL_STATUS) -- PAUSING for supervisor"
    notify_error "$PHASE" "Failed ($FINAL_STATUS). Orchestrator paused. Supervisor must diagnose and fix."
    touch "${HOME}/wrl-pause"
    wait_for_signal
    rm -f "${HOME}/wrl-pause"
    # Supervisor fixed it and sent GO -- re-check status before continuing
    if [[ "$(get_phase_status "$PHASE")" != "success" ]]; then
      log_error "Phase $PHASE still not success after GO signal -- stopping orchestrator"
      notify_error "$PHASE" "Still failed after supervisor intervention. Stopping."
      exit 1
    fi
    log_info "Phase $PHASE marked success by supervisor -- continuing"
  fi

  # --- Cleanup and pacing (always runs) ---

  cleanup_worktrees

  if [[ "$ACT_LAST" == "true" ]]; then
    # End of act: wait for GO signal
    notify_act_complete "$ACT" "$((i+1))"
    log_info "Act $ACT complete. Waiting for GO signal..."
    wait_for_signal
  else
    # Normal pause
    log_info "Pausing ${PAUSE_BETWEEN_PHASES}s before next phase..."
    sleep "$PAUSE_BETWEEN_PHASES"
  fi
done

# Summary
echo ""
echo "=========================================="
log_info "Execution Summary"
echo "=========================================="
for i in $(seq 0 $((PHASE_COUNT - 1))); do
  PHASE=$(jq -r ".phases[$i].phase" "$MANIFEST")
  TITLE=$(jq -r ".phases[$i].title" "$MANIFEST")
  STATUS=$(get_phase_status "$PHASE")
  printf "  %s %-50s %s\n" "$PHASE" "$TITLE" "$STATUS"
done

notify "Orchestration complete" "All $PHASE_COUNT phases processed. Check summary in logs." "high" "checkered_flag"
