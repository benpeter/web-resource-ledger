#!/usr/bin/env bash
# Clean up orphan git worktrees from failed sessions

cleanup_worktrees() {
  log_info "Cleaning up orphan worktrees..."
  local count=0

  # List worktrees and remove any that are prunable
  git worktree prune 2>/dev/null || true

  # Remove any .claude/worktrees directories that don't have active branches
  for wt in .claude/worktrees/*/; do
    if [[ -d "$wt" ]] && ! git worktree list --porcelain | grep -q "$(realpath "$wt")"; then
      log_info "Removing orphan worktree: $wt"
      rm -rf "$wt"
      count=$((count + 1))
    fi
  done

  if [[ $count -gt 0 ]]; then
    log_info "Cleaned up $count orphan worktree(s)"
  fi
}
