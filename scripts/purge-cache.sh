#!/usr/bin/env bash
# purge-cache.sh -- Purge CDN cache for WRL verification endpoints.
#
# Usage:
#   ./scripts/purge-cache.sh signing-keys              # purge signing key endpoints
#   ./scripts/purge-cache.sh capture cap_abc123...      # purge a specific capture
#   ./scripts/purge-cache.sh all                        # purge everything (nuclear)
#   ./scripts/purge-cache.sh --staging signing-keys     # target staging environment
#
# Requires: ADMIN_KEY in 1Password vault "WRL" (item "Production" or "Staging")
# Requires: op CLI (1Password), jq

set -euo pipefail

PROD_API="https://api.webresourceledger.com"
STAGING_API="https://staging.webresourceledger.com"
API_BASE="$PROD_API"
OP_ITEM="Production"

# Parse flags
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --staging)
      API_BASE="$STAGING_API"
      OP_ITEM="Staging"
      shift
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 [--staging] <signing-keys|capture <id>|all>" >&2
  exit 1
fi

ACTION="$1"

# Build targets array
case "$ACTION" in
  signing-keys)
    TARGETS='["signing-keys"]'
    ;;
  capture)
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 capture <cap_id>" >&2
      exit 1
    fi
    CAPTURE_ID="$2"
    if [[ ! "$CAPTURE_ID" =~ ^cap_[a-f0-9]{32}$ ]]; then
      echo "Invalid capture ID: $CAPTURE_ID (expected cap_ + 32 hex chars)" >&2
      exit 1
    fi
    TARGETS="[\"capture:${CAPTURE_ID}\"]"
    ;;
  all)
    TARGETS='["all"]'
    echo "WARNING: This will purge ALL cached content." >&2
    read -rp "Continue? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "Aborted."
      exit 0
    fi
    ;;
  *)
    echo "Unknown action: $ACTION" >&2
    echo "Allowed: signing-keys, capture <id>, all" >&2
    exit 1
    ;;
esac

# Get admin key from 1Password
eval "$(op signin)"
ADMIN_KEY=$(op item get "$OP_ITEM" --vault WRL --fields ADMIN_KEY --reveal)

echo "Purging cache: $ACTION (env: $OP_ITEM)"
echo "Targets: $TARGETS"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${API_BASE}/v1/admin/cache/purge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_KEY}" \
  -d "{\"targets\": ${TARGETS}}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo "Success (HTTP $HTTP_CODE):"
  echo "$BODY" | jq .
else
  echo "Failed (HTTP $HTTP_CODE):" >&2
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY" >&2
  exit 1
fi
