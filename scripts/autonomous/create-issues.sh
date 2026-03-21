#!/usr/bin/env bash
# tva
# Create GitHub issues for all manifest phases that don't have one yet.
# Uses claude --print to generate despicable-prompter style issue bodies.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
SPECS_DIR="$SCRIPT_DIR/issue-specs"

cd "$REPO_DIR"

# Source environment
if [[ -f ~/.wrlprofile ]]; then
  # shellcheck source=/dev/null
  source ~/.wrlprofile
fi

PHASE_COUNT=$(jq '.phases | length' "$MANIFEST")
CREATED=0
SKIPPED=0

for i in $(seq 0 $((PHASE_COUNT - 1))); do
  PHASE=$(jq -r ".phases[$i].phase" "$MANIFEST")
  ITEM=$(jq -r ".phases[$i].item" "$MANIFEST")
  ISSUE=$(jq -r ".phases[$i].issue // empty" "$MANIFEST")
  TITLE=$(jq -r ".phases[$i].title" "$MANIFEST")
  ACT=$(jq -r ".phases[$i].act" "$MANIFEST")

  # Skip if issue already exists
  if [[ -n "$ISSUE" ]] && [[ "$ISSUE" != "null" ]]; then
    echo "  $PHASE $ITEM: issue #$ISSUE exists, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Check if spec file exists
  SPEC_FILE="$SPECS_DIR/${ITEM}.md"
  if [[ ! -f "$SPEC_FILE" ]]; then
    echo "  $PHASE $ITEM: no spec file at $SPEC_FILE, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  BODY=$(cat "$SPEC_FILE")

  echo "  $PHASE $ITEM: creating issue '$TITLE'..."

  # Determine label
  LABEL="act-${ACT}"

  # Create issue
  ISSUE_URL=$(gh issue create \
    --title "$ITEM: $TITLE" \
    --body "$BODY" \
    --label "enhancement" \
    --label "$LABEL" 2>&1) || {
    echo "    FAILED to create issue for $ITEM"
    continue
  }

  # Extract issue number and update manifest
  ISSUE_NUM=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$' || true)
  if [[ -n "$ISSUE_NUM" ]]; then
    echo "    Created: #$ISSUE_NUM ($ISSUE_URL)"
    # Update manifest with issue number
    jq ".phases[$i].issue = $ISSUE_NUM" "$MANIFEST" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"
    CREATED=$((CREATED + 1))
  fi

  # Rate limit courtesy
  sleep 3
done

echo ""
echo "Done: $CREATED created, $SKIPPED skipped"
