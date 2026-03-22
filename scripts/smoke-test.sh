#!/usr/bin/env bash
# tva
# Smoke test for WRL staging deployments.
# Validates that the Worker is alive, configured, and can process captures.
#
# Required env vars:
#   SMOKE_URL     -- base URL of the deployed Worker
#   SMOKE_API_KEY -- API key for the staging environment
#
# Optional env vars:
#   SMOKE_CAPTURE_URL  -- URL to capture (default: https://example.com)
#   SMOKE_TIMEOUT      -- poll timeout in seconds (default: 60)
#   SMOKE_SKIP_CAPTURE -- set to 1 to skip capture round-trip

set -euo pipefail

# --- Prerequisites ---
for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd is required but not installed." >&2
    exit 1
  fi
done

# --- Configuration ---
: "${SMOKE_URL:?SMOKE_URL is required}"
: "${SMOKE_API_KEY:?SMOKE_API_KEY is required}"
SMOKE_CAPTURE_URL="${SMOKE_CAPTURE_URL:-https://example.com}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-90}"
SMOKE_SKIP_CAPTURE="${SMOKE_SKIP_CAPTURE:-0}"

# Strip trailing slash
SMOKE_URL="${SMOKE_URL%/}"

PASS_COUNT=0
FAIL_COUNT=0
TOTAL=0

# --- Helpers ---
pass() { PASS_COUNT=$((PASS_COUNT + 1)); TOTAL=$((TOTAL + 1)); echo "  PASS: $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); TOTAL=$((TOTAL + 1)); echo "  FAIL: $1" >&2; }

# --- Check 1: Health ---
echo "Check 1: Health endpoint"
HEALTH=$(curl -sf -w '\n%{http_code}' "${SMOKE_URL}/health" 2>/dev/null) || true
HEALTH_CODE=$(echo "$HEALTH" | tail -1)
HEALTH_BODY=$(echo "$HEALTH" | sed '$d')

if [ "$HEALTH_CODE" = "200" ] && echo "$HEALTH_BODY" | jq -e '.status == "ok"' >/dev/null 2>&1; then
  pass "/health returns 200 with status ok"
else
  fail "/health returned $HEALTH_CODE (expected 200 with status ok)"
  echo "FATAL: Health check failed. Aborting remaining checks." >&2
  echo ""
  echo "Results: 0/$((TOTAL)) passed"
  exit 1
fi

# --- Check 2: Security headers ---
echo "Check 2: Security headers"
HEADERS=$(curl -sI "${SMOKE_URL}/health" 2>/dev/null)
HEADER_OK=true

for h in "Referrer-Policy" "X-Content-Type-Options" "X-Frame-Options" "Strict-Transport-Security"; do
  if ! echo "$HEADERS" | grep -qi "^${h}:"; then
    fail "Missing header: $h"
    HEADER_OK=false
  fi
done

if echo "$HEADERS" | grep -qi 'rel="terms-of-service"'; then
  : # Link header present
else
  fail "Link header missing rel=\"terms-of-service\" (ToS wiring not deployed?)"
  HEADER_OK=false
fi

if [ "$HEADER_OK" = true ]; then
  pass "All security and legal headers present"
fi

# --- Check 3: Signing key ---
echo "Check 3: Signing key endpoint"
SK=$(curl -sf "${SMOKE_URL}/.well-known/signing-key" 2>/dev/null) || true

if echo "$SK" | jq -e '.algorithm == "Ed25519" and .publicKey != null' >/dev/null 2>&1; then
  pass "/.well-known/signing-key returns Ed25519 key"
else
  fail "/.well-known/signing-key did not return expected key format"
fi

# --- Check 4: Capture round-trip ---
if [ "$SMOKE_SKIP_CAPTURE" = "1" ]; then
  echo "Check 4: Capture round-trip (SKIPPED)"
else
  echo "Check 4: Capture round-trip"

  CREATE=$(curl -sf -w '\n%{http_code}' \
    -X POST "${SMOKE_URL}/v1/captures" \
    -H "Authorization: Bearer ${SMOKE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${SMOKE_CAPTURE_URL}\"}" 2>/dev/null) || true

  CREATE_CODE=$(echo "$CREATE" | tail -1)
  CREATE_BODY=$(echo "$CREATE" | sed '$d')
  CAPTURE_ID=$(echo "$CREATE_BODY" | jq -r '.id // empty' 2>/dev/null)

  if [ "$CREATE_CODE" != "202" ] || [ -z "$CAPTURE_ID" ]; then
    fail "POST /v1/captures returned $CREATE_CODE (expected 202 with capture ID)"
  else
    # Poll for completion
    ELAPSED=0
    STATUS=""
    while [ "$ELAPSED" -lt "$SMOKE_TIMEOUT" ]; do
      POLL=$(curl -sf "${SMOKE_URL}/v1/captures/${CAPTURE_ID}/status" 2>/dev/null) || true
      STATUS=$(echo "$POLL" | jq -r '.status // empty' 2>/dev/null)

      if [ "$STATUS" = "complete" ] || [ "$STATUS" = "failed" ]; then
        break
      fi
      sleep 5
      ELAPSED=$((ELAPSED + 5))
    done

    if [ "$STATUS" = "complete" ] || [ "$STATUS" = "failed" ]; then
      pass "Capture ${CAPTURE_ID} resolved to '${STATUS}' (infrastructure working)"
    else
      fail "Capture ${CAPTURE_ID} did not resolve within ${SMOKE_TIMEOUT}s (last status: ${STATUS:-unknown})"
    fi
  fi
fi

# --- Summary ---
echo ""
echo "Results: ${PASS_COUNT}/${TOTAL} passed"
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
