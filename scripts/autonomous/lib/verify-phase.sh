#!/usr/bin/env bash
# Post-session verification: CI, merge, deploy

verify_and_merge() {
  local pr_number="$1"
  local phase="$2"
  local skip_deploy="${3:-false}"

  # 1. Wait for CI
  log_info "Waiting for CI on PR #${pr_number}..."
  local ci_timeout=900  # 15 minutes
  local ci_elapsed=0

  while [[ $ci_elapsed -lt $ci_timeout ]]; do
    local ci_status
    ci_status=$(gh pr checks "$pr_number" --json name,state \
      --jq '[.[] | select(.name == "test")] | .[0].state // "PENDING"' 2>/dev/null || echo "PENDING")

    if [[ "$ci_status" == "SUCCESS" ]]; then
      log_info "CI passed for PR #${pr_number}"
      break
    elif [[ "$ci_status" == "FAILURE" ]]; then
      log_error "CI failed for PR #${pr_number}"
      return 1
    fi

    sleep 30
    ci_elapsed=$((ci_elapsed + 30))
  done

  if [[ $ci_elapsed -ge $ci_timeout ]]; then
    log_error "CI timeout for PR #${pr_number}"
    return 1
  fi

  # 2. Check if already merged (nefario sessions often merge their own PRs)
  local pr_state
  pr_state=$(gh pr view "$pr_number" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")

  if [[ "$pr_state" == "MERGED" ]]; then
    log_info "PR #${pr_number} already merged (by nefario session)"
  else
    log_info "Merging PR #${pr_number}..."
    if ! gh pr merge "$pr_number" --squash 2>&1; then
      # Double-check: maybe it merged between the check and the attempt
      pr_state=$(gh pr view "$pr_number" --json state --jq '.state' 2>/dev/null || echo "UNKNOWN")
      if [[ "$pr_state" == "MERGED" ]]; then
        log_info "PR #${pr_number} was merged concurrently"
      else
        log_error "Merge failed for PR #${pr_number} (state: $pr_state)"
        return 2
      fi
    else
      log_info "PR #${pr_number} merged successfully"
    fi
  fi

  # 3. Wait for deploy (if not skipped)
  if [[ "$skip_deploy" != "true" ]]; then
    log_info "Waiting for staging deploy..."
    sleep 120

    # Run smoke test against staging if available
    if [[ -f "scripts/smoke-test.sh" ]]; then
      log_info "Running staging smoke test..."
      SMOKE_SKIP_CAPTURE=1 bash scripts/smoke-test.sh \
        "https://wrl-staging.benpeter.workers.dev" 2>&1 || {
        log_warn "Staging smoke test failed (non-blocking)"
      }
    fi

    log_info "Waiting for production deploy..."
    sleep 180

    if [[ -f "scripts/smoke-test.sh" ]]; then
      log_info "Running production smoke test..."
      SMOKE_SKIP_CAPTURE=1 bash scripts/smoke-test.sh \
        "https://wrl.benpeter.workers.dev" 2>&1 || {
        log_warn "Production smoke test failed (non-blocking)"
      }
    fi
  fi

  return 0
}

# Extract PR number from claude session JSON output
extract_pr_number() {
  local json_file="$1"

  # Try to find PR URL in the output
  local pr_url
  pr_url=$(grep -oE 'https://github\.com/[^/]+/[^/]+/pull/\d+' "$json_file" 2>/dev/null | head -1 || true)

  if [[ -n "$pr_url" ]]; then
    echo "$pr_url" | grep -oE '\d+$'
    return 0
  fi

  # Fallback: check recent PRs
  local pr_number
  pr_number=$(gh pr list --state open --limit 5 --json number,headRefName \
    --jq '.[0].number' 2>/dev/null || true)

  if [[ -n "$pr_number" ]]; then
    echo "$pr_number"
    return 0
  fi

  return 1
}
