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
  missing_queues=$(echo "$failed_log" | sed -n 's/.*Queue "\([^"]*\)" does not exist.*/\1/p' || true)
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
  missing_d1=$(echo "$failed_log" | sed -n 's/.*D1 database "\([^"]*\)" does not exist.*/\1/p' || true)
  for db in $missing_d1; do
    log_info "Provisioning missing D1 database: $db"
    if (unset CLOUDFLARE_API_TOKEN && npx wrangler d1 create "$db" 2>&1); then
      log_info "D1 database $db created"
      # Run migrations if they exist
      local repo_dir
      repo_dir=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
      local migrations_dir="$repo_dir/migrations"
      if [[ -d "$migrations_dir" ]] && ls "$migrations_dir"/*.sql &>/dev/null; then
        log_info "Running D1 migrations for $db..."
        (unset CLOUDFLARE_API_TOKEN && npx wrangler d1 migrations apply "$db" --remote 2>&1) || {
          log_warn "D1 migrations failed for $db (may need manual intervention)"
        }
      fi
      fixed=true
    else
      log_error "Failed to create D1 database $db"
    fi
  done

  # Pattern: binding DB of type d1 must have a valid `id` specified
  # This means wrangler.toml has a placeholder D1 ID. Create the database,
  # then patch wrangler.toml with the real ID.
  if echo "$failed_log" | grep -q 'binding.*type d1 must have a valid.*id'; then
    log_info "D1 binding has invalid ID — scanning wrangler.toml for placeholders..."
    local repo_dir
    repo_dir=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    local wrangler_file="$repo_dir/wrangler.toml"

    # Find placeholder D1 entries and provision them
    local placeholder_entries
    placeholder_entries=$(grep -B2 'database_id.*PLACEHOLDER' "$wrangler_file" 2>/dev/null || true)
    if [[ -n "$placeholder_entries" ]]; then
      # Extract each database_name + placeholder pair
      while IFS= read -r db_name; do
        [[ -z "$db_name" ]] && continue
        log_info "Creating D1 database: $db_name"
        local create_output
        create_output=$(unset CLOUDFLARE_API_TOKEN && npx wrangler d1 create "$db_name" 2>&1 || true)
        local new_id
        new_id=$(echo "$create_output" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | head -1 || true)
        if [[ -n "$new_id" ]]; then
          log_info "D1 database $db_name created with ID $new_id"
          # Find the placeholder line that corresponds to this database_name
          sed -i.bak "/$db_name/{n;s/database_id = \"PLACEHOLDER[^\"]*\"/database_id = \"$new_id\"/;}" "$wrangler_file" 2>/dev/null || \
            sed -i '' "/$db_name/{n;s/database_id = \"PLACEHOLDER[^\"]*\"/database_id = \"$new_id\"/;}" "$wrangler_file" 2>/dev/null || true
          rm -f "${wrangler_file}.bak"
          fixed=true
        else
          log_error "Failed to create D1 database $db_name"
        fi
      done < <(grep 'database_name.*=.*"' "$wrangler_file" | grep -v '^#' | sed 's/.*= *"//;s/".*//' | while read -r name; do
        # Only emit names whose database_id is a PLACEHOLDER
        if grep -A1 "database_name.*\"$name\"" "$wrangler_file" | grep -q 'PLACEHOLDER'; then
          echo "$name"
        fi
      done)

      if [[ "$fixed" == "true" ]]; then
        log_info "Committing wrangler.toml with real D1 IDs..."
        git add "$wrangler_file"
        git commit -m "fix(ops): replace D1 placeholder IDs with real database IDs" 2>/dev/null || true
        git push origin main 2>/dev/null || true
      fi
    fi
  fi

  # Pattern: KV namespace "X" does not exist
  local missing_kv
  missing_kv=$(echo "$failed_log" | sed -n 's/.*KV namespace "\([^"]*\)" does not exist.*/\1/p' || true)
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
