#!/usr/bin/env bash
# tva
# Self-healing: diagnose phase failures and suggest/apply fixes for retry

MAX_PHASE_ATTEMPTS="${MAX_PHASE_ATTEMPTS:-3}"

# Diagnose why a phase failed by examining session output.
# Prints a diagnosis code to stdout. Returns 0 if retryable, 1 if not.
diagnose_failure() {
  local phase="$1"
  local phase_output="${LOG_DIR}/phase-${phase}.json"
  local phase_status
  phase_status=$(get_phase_status "$phase")

  # No output file at all
  if [[ ! -f "$phase_output" ]]; then
    echo "no_output"
    return 1
  fi

  local result_text=""
  result_text=$(jq -r '.result // ""' "$phase_output" 2>/dev/null || true)
  local cost
  cost=$(jq -r '.total_cost_usd // 0' "$phase_output" 2>/dev/null || echo "0")

  # 1. Compaction/blocking: session ended waiting for user input
  if echo "$result_text" | grep -qi "compaction.*clipboard\|wait.*user\|type.*continue\|Phase [0-9].* complete\. Compaction"; then
    echo "blocked_compaction"
    return 0
  fi

  # 2. AskUserQuestion denial caused session to stall
  local denial_count
  denial_count=$(jq '.permission_denials | length' "$phase_output" 2>/dev/null || echo "0")
  if [[ "$denial_count" -gt 5 ]]; then
    echo "excessive_permission_denials"
    return 0
  fi

  # 3. Budget exhausted (session ran out of money before completing)
  local stop_reason
  stop_reason=$(jq -r '.stop_reason // ""' "$phase_output" 2>/dev/null || true)
  if [[ "$stop_reason" == "budget_exceeded" ]] || echo "$result_text" | grep -qi "budget.*exceeded\|budget.*limit"; then
    echo "budget_exhausted"
    return 0
  fi

  # 4. Session produced no meaningful output (empty or very short)
  local num_turns
  num_turns=$(jq -r '.num_turns // 0' "$phase_output" 2>/dev/null || echo "0")
  if [[ "$num_turns" -lt 5 ]]; then
    echo "session_too_short"
    return 0
  fi

  # 5. Session completed but no PR (planning finished, execution didn't happen)
  if [[ "$phase_status" == "failed_no_pr" ]] && [[ "$num_turns" -gt 20 ]]; then
    echo "planning_only"
    return 0
  fi

  # 6. Generic no-PR failure
  if [[ "$phase_status" == "failed_no_pr" ]]; then
    echo "unknown_no_pr"
    return 0
  fi

  # 7. CI/deploy failures are not retryable via session changes
  if [[ "$phase_status" == "failed_ci" || "$phase_status" == "failed_deploy" ]]; then
    echo "infra_failure"
    return 1
  fi

  echo "unknown"
  return 1
}

# Apply a fix for the diagnosed issue. Returns 0 if a fix was applied.
apply_fix() {
  local diagnosis="$1"
  local phase="$2"
  local attempt="$3"

  case "$diagnosis" in
    blocked_compaction|planning_only)
      log_info "Self-heal [$diagnosis]: strengthening autonomous prompt for retry"
      # The session-prompt.md already has the fix, but add an even more
      # explicit per-attempt reinforcement via the session prompt suffix
      SELF_HEAL_SUFFIX="

### Self-Heal Reinforcement (attempt $attempt)

Previous attempt failed because the session stopped at a compaction
checkpoint waiting for user input. This is attempt $attempt.

ABSOLUTE RULES for this retry:
1. NEVER print 'Phase N complete. Compaction prompt copied to clipboard.'
2. NEVER call pbcopy with a /compact command
3. NEVER STOP between phases. When you finish Phase 3 synthesis,
   IMMEDIATELY proceed to Phase 3.5. When you finish Phase 3.5,
   IMMEDIATELY proceed to Execution Plan Approval.
4. Skip ALL compaction checkpoints entirely — they are no-ops.
5. If you feel the urge to wait for user input, that urge is WRONG.
   Proceed immediately."
      return 0
      ;;

    budget_exhausted)
      log_info "Self-heal [$diagnosis]: increasing budget by 50% for retry"
      SELF_HEAL_BUDGET_MULTIPLIER="1.5"
      return 0
      ;;

    excessive_permission_denials)
      log_info "Self-heal [$diagnosis]: reinforcing gate protocol for retry"
      SELF_HEAL_SUFFIX="

### Self-Heal: Permission Denial Fix (attempt $attempt)

Previous attempt had excessive AskUserQuestion denials. Remember:
AskUserQuestion is NOT available. For EVERY gate decision, spawn a
Lucy agent instead. Do not attempt AskUserQuestion — it will be denied
and waste your budget."
      return 0
      ;;

    session_too_short)
      log_info "Self-heal [$diagnosis]: session was too short, retrying as-is"
      # Likely a transient error, just retry
      return 0
      ;;

    unknown_no_pr)
      log_info "Self-heal [$diagnosis]: unknown cause, retrying with reinforcement"
      SELF_HEAL_SUFFIX="

### Self-Heal: Completion Reinforcement (attempt $attempt)

Previous attempt did not produce a PR. You MUST complete the full
nefario workflow through to PR creation. If you encounter any blocker,
work around it rather than stopping."
      return 0
      ;;

    *)
      log_warn "Self-heal: no fix available for diagnosis '$diagnosis'"
      return 1
      ;;
  esac
}

# Reset phase state for retry
reset_for_retry() {
  local phase="$1"
  local attempt="$2"

  # Archive previous attempt output
  local phase_output="${LOG_DIR}/phase-${phase}.json"
  local phase_log="${LOG_DIR}/phase-${phase}.log"

  if [[ -f "$phase_output" ]]; then
    mv "$phase_output" "${LOG_DIR}/phase-${phase}.attempt${attempt}.json"
  fi
  if [[ -f "$phase_log" ]]; then
    mv "$phase_log" "${LOG_DIR}/phase-${phase}.attempt${attempt}.log"
  fi

  set_phase_status "$phase" "retry_${attempt}"
  cleanup_worktrees
}
