Add Check 5 (Build version) to the smoke test script.

## What to do

### Modify scripts/smoke-test.sh

1. Update header comment -- add to Optional env vars section:
   #   GITHUB_SHA         -- expected commit SHA (auto-set by GitHub Actions; skip check if absent)

2. Add Check 5 between end of Check 4 (line 138) and Summary section (line 140):

# --- Check 5: Build version ---
if [ -z "${GITHUB_SHA:-}" ]; then
  echo "Check 5: Build version (SKIPPED -- GITHUB_SHA not set)"
elif ! echo "$GITHUB_SHA" | grep -qE '^[0-9a-f]{7,40}$'; then
  echo "Check 5: Build version (SKIPPED -- GITHUB_SHA is not a commit SHA)"
else
  echo "Check 5: Build version matches deployed commit"
  ATTEMPTS=0
  MAX_ATTEMPTS=6
  MATCH=false

  while [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
    DEPLOYED_SHA=$(curl -sf "${SMOKE_URL}/health" 2>/dev/null | jq -r '.build.commit // empty')
    if [ "$DEPLOYED_SHA" = "$GITHUB_SHA" ]; then
      MATCH=true
      break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ] && sleep 5
  done

  if [ "$MATCH" = true ]; then
    pass "Deployed commit matches expected (${GITHUB_SHA:0:7}...)"
  else
    fail "Deployed commit '${DEPLOYED_SHA:-empty}' does not match expected '${GITHUB_SHA:0:7}...' after ${MAX_ATTEMPTS} attempts"
  fi
fi

Design decisions (do not deviate):
- Separate check, NOT integrated into Check 1
- 6 attempts, 5s fixed interval, 30s max
- Full 40-char SHA comparison (display first 7 chars only in messages)
- Skip when GITHUB_SHA absent (auto-set by GitHub Actions)
- Skip when GITHUB_SHA is not hex (handles branch/tag names from workflow_dispatch)
- Non-fatal (uses fail function, not exit 1)
- Use $((ATTEMPTS + 1)) not ((ATTEMPTS++)) to avoid set -e zero-exit trap

## What NOT to do
- Do NOT modify existing Checks 1-4
- Do NOT add a new env var like SMOKE_EXPECTED_SHA
- Do NOT modify workflow files or source code

## Verification
- shellcheck scripts/smoke-test.sh passes
- Running without GITHUB_SHA prints "SKIPPED"

When done, mark task completed and report file paths with line counts.
