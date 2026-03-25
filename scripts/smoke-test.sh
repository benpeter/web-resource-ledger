#!/usr/bin/env bash
# tva
# Smoke test for WRL staging deployments.
# Validates that the Worker is alive, configured, and can process captures.
#
# Required env vars:
#   SMOKE_URL     -- base URL of the deployed Worker (or pass as $1)
#   SMOKE_API_KEY -- API key for the staging environment (required unless SMOKE_SKIP_CAPTURE=1)
#
# Optional env vars:
#   SMOKE_CAPTURE_URL  -- URL to capture (default: https://example.com)
#   SMOKE_TIMEOUT      -- poll timeout in seconds (default: 60)
#   SMOKE_SKIP_CAPTURE -- set to 1 to skip capture round-trip
#   SMOKE_EXPECTED_COMMIT -- expected commit SHA (set by orchestrator; overrides GITHUB_SHA)
#   GITHUB_SHA         -- expected commit SHA (auto-set by GitHub Actions; skip check if absent)
#   SMOKE_VERIFY_URL   -- base URL of the verify subdomain (e.g. https://verify-staging.webresourceledger.com)
#                         if set, runs verify subdomain checks; if unset, skips them

set -euo pipefail

# --- Prerequisites ---
for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd is required but not installed." >&2
    exit 1
  fi
done

# --- Configuration ---
SMOKE_URL="${SMOKE_URL:-${1:-}}"
: "${SMOKE_URL:?SMOKE_URL is required (set env var or pass as \$1)}"
SMOKE_CAPTURE_URL="${SMOKE_CAPTURE_URL:-https://example.com}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-90}"
SMOKE_SKIP_CAPTURE="${SMOKE_SKIP_CAPTURE:-0}"
SMOKE_API_KEY="${SMOKE_API_KEY:-}"
SMOKE_VERIFY_URL="${SMOKE_VERIFY_URL:-}"

if [ "$SMOKE_SKIP_CAPTURE" != "1" ] && [ -z "$SMOKE_API_KEY" ]; then
  echo "ERROR: SMOKE_API_KEY is required when SMOKE_SKIP_CAPTURE != 1" >&2
  exit 1
fi

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
      POLL=$(curl -sf -H "Authorization: Bearer ${SMOKE_API_KEY}" \
        "${SMOKE_URL}/v1/captures/${CAPTURE_ID}/status" 2>/dev/null) || true
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

# --- Check 5: Build version ---
EXPECTED_COMMIT="${SMOKE_EXPECTED_COMMIT:-${GITHUB_SHA:-}}"
if [ -z "$EXPECTED_COMMIT" ]; then
  echo "Check 5: Build version (SKIPPED -- neither SMOKE_EXPECTED_COMMIT nor GITHUB_SHA set)"
elif ! echo "$EXPECTED_COMMIT" | grep -qE '^[0-9a-f]{7,40}$'; then
  echo "Check 5: Build version (SKIPPED -- expected commit is not a valid SHA)"
else
  echo "Check 5: Build version matches deployed commit"
  ATTEMPTS=0
  MAX_ATTEMPTS=6
  MATCH=false

  while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
    DEPLOYED_SHA=$(curl -sf "${SMOKE_URL}/health" 2>/dev/null | jq -r '.build.commit // empty')
    if [ "$DEPLOYED_SHA" = "$EXPECTED_COMMIT" ]; then
      MATCH=true
      break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ] && sleep 5
  done

  if [ "$MATCH" = true ]; then
    pass "Deployed commit matches expected (${EXPECTED_COMMIT:0:7}...)"
  else
    fail "Deployed commit '${DEPLOYED_SHA:-empty}' does not match expected '${EXPECTED_COMMIT:0:7}...' after ${MAX_ATTEMPTS} attempts"
  fi
fi

# --- Check 6: Verify subdomain ---
if [ -z "$SMOKE_VERIFY_URL" ]; then
  echo "Check 6: Verify subdomain (SKIPPED -- SMOKE_VERIFY_URL not set)"
else
  VERIFY_URL="${SMOKE_VERIFY_URL%/}"
  echo "Check 6: Verify subdomain ($VERIFY_URL)"

  # 6a: Health endpoint responds 200
  VH=$(curl -sf -w '\n%{http_code}' "${VERIFY_URL}/health" 2>/dev/null) || true
  VH_CODE=$(echo "$VH" | tail -1)
  if [ "$VH_CODE" = "200" ]; then
    pass "verify /health returns 200"
  else
    fail "verify /health returned $VH_CODE (expected 200)"
  fi

  # 6b: Signing-key endpoint returns valid JSON
  VSK=$(curl -sf "${VERIFY_URL}/.well-known/signing-key" 2>/dev/null) || true
  if echo "$VSK" | jq -e '.algorithm == "Ed25519" and .publicKey != null' >/dev/null 2>&1; then
    pass "verify /.well-known/signing-key returns Ed25519 key"
  else
    fail "verify /.well-known/signing-key did not return expected key format"
  fi

  # 6c: Cache headers on signing-key endpoint
  VSK_HEADERS=$(curl -sI "${VERIFY_URL}/.well-known/signing-key" 2>/dev/null) || true
  VSK_CC=$(echo "$VSK_HEADERS" | grep -i '^cache-control:' | tr -d '\r')
  VSK_ST=$(echo "$VSK_HEADERS" | grep -i '^server-timing:' | tr -d '\r')

  if echo "$VSK_CC" | grep -qi 'public.*max-age=3600'; then
    pass "verify signing-key has Cache-Control: public, max-age=3600"
  else
    fail "verify signing-key Cache-Control missing or incorrect: ${VSK_CC}"
  fi

  if echo "$VSK_ST" | grep -qi 'cache;desc='; then
    pass "verify signing-key has Server-Timing cache header"
  else
    fail "verify signing-key Server-Timing header missing: ${VSK_ST}"
  fi

  # 6d: Non-verify path returns 404
  VBLOCK=$(curl -sf -w '\n%{http_code}' -o /dev/null "${VERIFY_URL}/v1/captures" 2>/dev/null) || true
  VBLOCK_CODE=$(echo "$VBLOCK" | tail -1)
  if [ "$VBLOCK_CODE" = "404" ]; then
    pass "verify /v1/captures returns 404 (blocked as expected)"
  else
    fail "verify /v1/captures returned $VBLOCK_CODE (expected 404)"
  fi
fi

# --- Summary ---
echo ""
echo "Results: ${PASS_COUNT}/${TOTAL} passed"
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
