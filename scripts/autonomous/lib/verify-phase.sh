#!/usr/bin/env bash
# tva
# Post-session verification: CI, merge, deploy

verify_and_merge() {
  local pr_number="$1"
  local phase="$2"
  local skip_deploy="${3:-false}"

  # 1. Wait for CI (all checks)
  log_info "Waiting for CI on PR #${pr_number}..."
  local ci_timeout=900  # 15 minutes
  local ci_elapsed=0
  local test_passed=false
  local integration_passed=false

  while [[ $ci_elapsed -lt $ci_timeout ]]; do
    local checks_json
    checks_json=$(gh pr checks "$pr_number" --json name,state 2>/dev/null || echo "[]")

    local test_state
    test_state=$(echo "$checks_json" | jq -r '[.[] | select(.name == "test")] | .[0].state // "PENDING"')
    local integration_state
    integration_state=$(echo "$checks_json" | jq -r '[.[] | select(.name == "test-integration")] | .[0].state // "PENDING"')

    # test is blocking
    if [[ "$test_state" == "FAILURE" ]]; then
      log_error "CI failed for PR #${pr_number} (test)"
      return 1
    fi
    if [[ "$test_state" == "SUCCESS" ]]; then
      test_passed=true
    fi

    # test-integration is advisory (continue-on-error in workflow)
    if [[ "$integration_state" == "FAILURE" ]]; then
      log_warn "Integration tests failed for PR #${pr_number} (non-blocking)"
      integration_passed=true  # treat as done, not blocking
    fi
    if [[ "$integration_state" == "SUCCESS" ]]; then
      integration_passed=true
    fi
    # SKIPPED also counts as done
    if [[ "$integration_state" == "SKIPPED" ]]; then
      integration_passed=true
    fi

    if [[ "$test_passed" == "true" && "$integration_passed" == "true" ]]; then
      log_info "CI passed for PR #${pr_number}"
      break
    fi

    # If test passed but integration is still pending, wait a bit more
    if [[ "$test_passed" == "true" && "$integration_passed" != "true" ]]; then
      log_info "test passed, waiting for test-integration..."
    fi

    sleep 30
    ci_elapsed=$((ci_elapsed + 30))
  done

  if [[ $ci_elapsed -ge $ci_timeout ]]; then
    if [[ "$test_passed" == "true" ]]; then
      log_warn "CI timeout waiting for test-integration (test passed, proceeding)"
    else
      log_error "CI timeout for PR #${pr_number}"
      return 1
    fi
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

  # 3. Get merge commit SHA for deploy tracking
  local merge_sha
  merge_sha=$(gh pr view "$pr_number" --json mergeCommit --jq '.mergeCommit.oid' 2>/dev/null || echo "")

  # 4. Wait for deploy (if not skipped)
  if [[ "$skip_deploy" != "true" ]]; then
    if ! wait_for_deploy "$merge_sha" "$phase"; then
      return 3
    fi
  fi

  return 0
}

# Wait for staging + production deploy, with failure recovery
wait_for_deploy() {
  local commit_sha="$1"
  local phase="$2"
  local deploy_timeout=600  # 10 minutes per stage
  local short_sha="${commit_sha:0:12}"

  # --- Staging deploy ---
  log_info "Waiting for staging deploy (commit $short_sha)..."
  local staging_run_id=""
  local staging_elapsed=0

  # Wait for the staging workflow run to appear
  while [[ $staging_elapsed -lt 120 ]]; do
    staging_run_id=$(gh run list --workflow deploy-staging.yml --limit 5 \
      --json databaseId,headSha,status \
      --jq "[.[] | select(.headSha | startswith(\"${short_sha}\"))] | .[0].databaseId // empty" 2>/dev/null || true)
    if [[ -n "$staging_run_id" ]]; then
      break
    fi
    sleep 15
    staging_elapsed=$((staging_elapsed + 15))
  done

  if [[ -z "$staging_run_id" ]]; then
    log_warn "No staging deploy workflow found for $short_sha (may be docs-only)"
    return 0
  fi

  # Poll staging workflow
  local staging_result=""
  staging_elapsed=0
  while [[ $staging_elapsed -lt $deploy_timeout ]]; do
    staging_result=$(gh run view "$staging_run_id" --json conclusion --jq '.conclusion // "pending"' 2>/dev/null || echo "pending")

    if [[ "$staging_result" == "success" ]]; then
      log_info "Staging deploy succeeded"
      break
    elif [[ "$staging_result" == "failure" ]]; then
      log_error "Staging deploy failed (run $staging_run_id)"

      # Attempt auto-fix
      if try_fix_deploy "$staging_run_id"; then
        # Retry deploy
        log_info "Retrying staging deploy..."
        gh workflow run deploy-staging.yml --repo benpeter/web-resource-ledger 2>/dev/null || true
        sleep 30

        # Find the retry run
        local retry_run_id
        retry_run_id=$(gh run list --workflow deploy-staging.yml --limit 1 \
          --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)

        if [[ -n "$retry_run_id" ]]; then
          local retry_elapsed=0
          while [[ $retry_elapsed -lt $deploy_timeout ]]; do
            local retry_result
            retry_result=$(gh run view "$retry_run_id" --json conclusion --jq '.conclusion // "pending"' 2>/dev/null || echo "pending")
            if [[ "$retry_result" == "success" ]]; then
              log_info "Staging deploy retry succeeded"
              staging_result="success"
              break
            elif [[ "$retry_result" == "failure" ]]; then
              log_error "Staging deploy retry also failed"
              break
            fi
            sleep 30
            retry_elapsed=$((retry_elapsed + 30))
          done
        fi
      fi

      if [[ "$staging_result" != "success" ]]; then
        notify_error "$phase" "Staging deploy failed and auto-fix didn't help. Run $staging_run_id"
        touch "${HOME}/wrl-pause"
        return 1
      fi
      break
    fi

    sleep 30
    staging_elapsed=$((staging_elapsed + 30))
  done

  if [[ "$staging_result" != "success" && "$staging_result" != "failure" ]]; then
    log_warn "Staging deploy timeout (run $staging_run_id)"
  fi

  # Run staging smoke test
  if [[ -f "scripts/smoke-test.sh" ]]; then
    log_info "Running staging smoke test..."
    SMOKE_SKIP_CAPTURE=1 bash scripts/smoke-test.sh \
      "https://wrl-staging.benpeter.workers.dev" 2>&1 || {
      log_warn "Staging smoke test failed (non-blocking)"
    }
  fi

  # --- Production deploy ---
  # Production is triggered by staging success via workflow_run
  log_info "Waiting for production deploy..."
  local prod_run_id=""
  local prod_elapsed=0

  # Wait for production workflow to appear (triggered by staging completion)
  while [[ $prod_elapsed -lt 180 ]]; do
    prod_run_id=$(gh run list --workflow deploy-production.yml --limit 3 \
      --json databaseId,createdAt,status \
      --jq '.[0].databaseId // empty' 2>/dev/null || true)
    if [[ -n "$prod_run_id" ]]; then
      local prod_status
      prod_status=$(gh run view "$prod_run_id" --json status --jq '.status' 2>/dev/null || echo "")
      if [[ "$prod_status" == "in_progress" || "$prod_status" == "queued" ]]; then
        break
      fi
    fi
    sleep 30
    prod_elapsed=$((prod_elapsed + 30))
  done

  if [[ -n "$prod_run_id" ]]; then
    # Poll production workflow
    prod_elapsed=0
    while [[ $prod_elapsed -lt $deploy_timeout ]]; do
      local prod_result
      prod_result=$(gh run view "$prod_run_id" --json conclusion --jq '.conclusion // "pending"' 2>/dev/null || echo "pending")

      if [[ "$prod_result" == "success" ]]; then
        log_info "Production deploy succeeded"
        break
      elif [[ "$prod_result" == "failure" ]]; then
        log_warn "Production deploy failed (run $prod_run_id, non-blocking)"
        break
      fi

      sleep 30
      prod_elapsed=$((prod_elapsed + 30))
    done

    # Run production smoke test
    if [[ -f "scripts/smoke-test.sh" ]]; then
      log_info "Running production smoke test..."
      SMOKE_SKIP_CAPTURE=1 bash scripts/smoke-test.sh \
        "https://wrl.benpeter.workers.dev" 2>&1 || {
        log_warn "Production smoke test failed (non-blocking)"
      }
    fi
  else
    log_warn "No production deploy workflow detected"
  fi

  return 0
}

# Extract PR number from claude session JSON output
extract_pr_number() {
  local json_file="$1"

  # Try to find PR URL in the output
  local pr_url
  pr_url=$(grep -oE 'https://github\.com/[^/]+/[^/]+/pull/[0-9]+' "$json_file" 2>/dev/null | head -1 || true)

  if [[ -n "$pr_url" ]]; then
    echo "$pr_url" | grep -oE '[0-9]+$'
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
