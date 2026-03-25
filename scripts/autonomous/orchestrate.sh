#!/usr/bin/env bash
# tva
# WRL Phase Runner — runs a single phase, then exits.
# The supervisor session controls sequencing; this script runs one phase.
#
# Usage: bash scripts/autonomous/orchestrate.sh <phase-number>
#
# Exit codes:
#   0  — success
#   1  — failed_session (claude exited non-zero)
#   2  — failed_no_pr (session completed but no PR)
#   3  — failed_ci
#   4  — failed_merge
#   5  — failed_deploy
#  10  — deps_not_met
#  11  — phase_not_found
#  12  — already_done
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
PROMPT_TEMPLATE="$SCRIPT_DIR/session-prompt.md"

# --- Argument parsing ---

PHASE="${1:-}"
if [[ -z "$PHASE" ]]; then
  echo "Usage: $0 <phase-number>" >&2
  exit 1
fi

# Source WRL secrets (API keys for wrangler, Stripe, etc.)
# NOTE: Do NOT source ~/.wrlprofile here -- it exports CLAUDE_OAUTH_TOKEN
# and CLAUDE_CONFIG_DIR which override the Claude CLI's own auth.
if [[ -f ~/.wrl-keys ]]; then
  # shellcheck source=/dev/null
  source ~/.wrl-keys
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
log_info "Phase runner starting for phase $PHASE. Logs: $LOG_DIR"
log_info "Repo: $REPO_DIR"

# Configuration
CLAUDE_MODEL="${CLAUDE_MODEL:-opus}"

cd "$REPO_DIR"

# --- Look up phase in manifest ---

PHASE_INDEX=$(jq -r --arg p "$PHASE" '
  .phases | to_entries[] | select(.value.phase == $p) | .key
' "$MANIFEST")

if [[ -z "$PHASE_INDEX" ]]; then
  log_error "Phase $PHASE not found in manifest"
  exit 11
fi

ITEM=$(jq -r ".phases[$PHASE_INDEX].item" "$MANIFEST")
ISSUE=$(jq -r ".phases[$PHASE_INDEX].issue // empty" "$MANIFEST")
TITLE=$(jq -r ".phases[$PHASE_INDEX].title" "$MANIFEST")
ACT=$(jq -r ".phases[$PHASE_INDEX].act" "$MANIFEST")

# --- Pre-phase checks ---

# Check if already done
PHASE_STATUS=$(get_phase_status "$PHASE")
if [[ "$PHASE_STATUS" == "success" ]]; then
  log_info "Phase $PHASE ($TITLE): already done"
  exit 12
fi

# Check dependencies
DEPS=$(jq -r ".phases[$PHASE_INDEX].depends_on[]?" "$MANIFEST")
for dep in $DEPS; do
  DEP_STATUS=$(get_phase_status "$dep")
  if [[ "$DEP_STATUS" != "success" ]]; then
    log_error "Phase $PHASE: dependency $dep not met (status: $DEP_STATUS)"
    exit 10
  fi
done

# --- Run phase ---

echo ""
echo "=========================================="
log_info "Phase $PHASE - $TITLE (Act $ACT)"
log_info "Issue: ${ISSUE:-TBD}"
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

# Read prompt template and inject phase number
PROMPT_BASE=$(cat "$PROMPT_TEMPLATE")
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

# Check for human action items (regardless of session success/failure)
if grep -q "HUMAN_ACTION_REQUIRED:" "$PHASE_OUTPUT" 2>/dev/null; then
  log_warn "Phase $PHASE requires human action:"
  grep "HUMAN_ACTION_REQUIRED:" "$PHASE_OUTPUT" | while IFS= read -r line; do
    log_warn "  → ${line#*HUMAN_ACTION_REQUIRED: }"
  done
  grep "HUMAN_ACTION_REQUIRED:" "$PHASE_OUTPUT" > "${LOG_DIR}/phase-${PHASE}.human-actions" 2>/dev/null || true
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

    # Notify human actions if any
    if [[ -f "${LOG_DIR}/phase-${PHASE}.human-actions" ]]; then
      HUMAN_ACTIONS=$(sed 's/.*HUMAN_ACTION_REQUIRED: //' "${LOG_DIR}/phase-${PHASE}.human-actions" | tr '\n' '; ')
      notify_error "$PHASE" "HUMAN ACTION REQUIRED: $HUMAN_ACTIONS"
    fi

    # Verify evolution log completeness (check after merge, when files are on main)
    git pull --quiet --rebase 2>/dev/null || true

    # Apply any pending D1 migrations (safe no-op when current)
    log_info "Applying D1 migrations..."
    (unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply wrl-metadata --remote 2>&1) || \
      log_warn "D1 migration apply failed for production (may need manual intervention)"
    (unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply wrl-metadata-staging --remote --env staging 2>&1) || \
      log_warn "D1 migration apply failed for staging (may need manual intervention)"
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

# --- Cleanup and exit ---

cleanup_worktrees

FINAL_STATUS=$(get_phase_status "$PHASE")
log_info "Phase $PHASE finished with status: $FINAL_STATUS"

case "$FINAL_STATUS" in
  success)       exit 0 ;;
  failed_session) exit 1 ;;
  failed_no_pr)  exit 2 ;;
  failed_ci)     exit 3 ;;
  failed_merge)  exit 4 ;;
  failed_deploy) exit 5 ;;
  *)             exit 1 ;;
esac
