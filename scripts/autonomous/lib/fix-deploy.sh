#!/usr/bin/env bash
# tva
# Deploy failure recovery: parse wrangler errors and auto-provision resources.

try_fix_deploy() {
  local run_id="$1"

  log_info "Analyzing deploy failure for run $run_id..."

  local failed_log
  failed_log=$(gh run view "$run_id" --log-failed 2>/dev/null || true)

  if [[ -z "$failed_log" ]]; then
    log_warn "Could not fetch failed logs for run $run_id"
    return 1
  fi

  local fixed=false

  # Pattern: Queue "X" does not exist
  local missing_queues
  missing_queues=$(echo "$failed_log" | grep -oP 'Queue "\K[^"]+(?=" does not exist)' || true)
  for queue in $missing_queues; do
    log_info "Provisioning missing queue: $queue"
    if (unset CLOUDFLARE_API_TOKEN && npx wrangler queues create "$queue" 2>&1); then
      log_info "Queue $queue created"
      fixed=true
    else
      log_error "Failed to create queue $queue"
    fi
  done

  # Pattern: D1 database "X" does not exist
  local missing_d1
  missing_d1=$(echo "$failed_log" | grep -oP 'D1 database "\K[^"]+(?=" does not exist)' || true)
  for db in $missing_d1; do
    log_info "Provisioning missing D1 database: $db"
    if (unset CLOUDFLARE_API_TOKEN && npx wrangler d1 create "$db" 2>&1); then
      log_info "D1 database $db created"
      fixed=true
    else
      log_error "Failed to create D1 database $db"
    fi
  done

  # Pattern: KV namespace "X" does not exist
  local missing_kv
  missing_kv=$(echo "$failed_log" | grep -oP 'KV namespace "\K[^"]+(?=" does not exist)' || true)
  for ns in $missing_kv; do
    log_info "Provisioning missing KV namespace: $ns"
    if (unset CLOUDFLARE_API_TOKEN && npx wrangler kv namespace create "$ns" 2>&1); then
      log_info "KV namespace $ns created"
      fixed=true
    else
      log_error "Failed to create KV namespace $ns"
    fi
  done

  if [[ "$fixed" == "true" ]]; then
    log_info "Resources provisioned. Retrying deploy..."
    return 0
  else
    log_error "No fixable errors found in deploy logs"
    return 1
  fi
}
