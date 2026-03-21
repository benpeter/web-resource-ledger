#!/usr/bin/env bash
# Verify all credentials needed for autonomous execution
set -euo pipefail

echo "=== WRL Orchestrator Credential Check ==="
echo ""

ERRORS=0

check() {
  local name="$1"
  local cmd="$2"
  printf "  %-25s " "$name"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    ERRORS=$((ERRORS + 1))
  fi
}

echo "Core tools:"
check "GitHub CLI" "gh auth status"
check "Claude CLI" "claude --version"
check "Wrangler" "unset CLOUDFLARE_API_TOKEN && npx wrangler whoami"
check "jq" "jq --version"
check "Node.js" "node --version"

echo ""
echo "Environment:"
check "$HOME/.wrlprofile" "test -f $HOME/.wrlprofile"
check "CLAUDE_CONFIG_DIR" "test -n \"\${CLAUDE_CONFIG_DIR:-}\""
check "$HOME/.secrets" "test -f $HOME/.secrets"

echo ""
echo "API access:"
check "Staging endpoint" "curl -sf https://wrl-staging.benpeter.workers.dev/health"
check "Production endpoint" "curl -sf https://wrl.benpeter.workers.dev/health"

echo ""
echo "Optional (needed later):"
printf "  %-25s " "1Password"
if op account list > /dev/null 2>&1; then echo "OK"; else echo "SKIP (not critical for start)"; fi
printf "  %-25s " "ntfy.sh"
if curl -sf "https://ntfy.sh/wrl-orchestrator-ben-2026/json?poll=1" > /dev/null 2>&1; then echo "OK"; else echo "SKIP"; fi

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "FAILED: $ERRORS check(s) failed. Fix before running orchestrator."
  exit 1
else
  echo "All core checks passed. Ready to run orchestrate.sh."
fi
