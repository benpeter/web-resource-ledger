#!/usr/bin/env bash
# tva
# Generate/update packages/verify/CHANGELOG.md for a given version bump.
# Scopes to commits touching packages/verify/ since the last verify/v* tag.
#
# Usage:
#   ./scripts/changelog-verify.sh <patch|minor|major>
#
# Prerequisites: git, node
#
# Safety note: commit messages flow through grep/sed pipelines and are only
# ever written to CHANGELOG.md -- never eval'd or executed. Do not refactor
# this to pass commit messages as shell arguments or into eval.

set -euo pipefail

BUMP="${1:-}"
if [[ "$BUMP" != patch && "$BUMP" != minor && "$BUMP" != major ]]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

CHANGELOG="packages/verify/CHANGELOG.md"
TODAY=$(date +%Y-%m-%d)

# --- Compute next version ---
CURRENT=$(node -p "require('./packages/verify/package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac
NEXT="${MAJOR}.${MINOR}.${PATCH}"

# --- Gather commits ---
PREV_TAG=$(git describe --tags --match 'verify/v*' --abbrev=0 2>/dev/null || true)
if [ -n "$PREV_TAG" ]; then
  LOG=$(git log --oneline "${PREV_TAG}..HEAD" -- packages/verify/ 2>/dev/null || true)
else
  LOG=$(git log --oneline -- packages/verify/ 2>/dev/null || true)
fi

# --- Categorise commits ---
extract() { echo "$LOG" | grep -iE "^[a-f0-9]+ $1(\(|:| )" | sed 's/^[a-f0-9]* //' || true; }

FEATS=$(extract "feat")
FIXES=$(extract "fix")
DOCS=$(extract "docs")
REFACTOR=$(extract "refactor")
CHORE=$(extract "chore")
TEST=$(extract "test")
OTHER=$(echo "$LOG" | grep -vE "^[a-f0-9]+ (feat|fix|docs|refactor|chore|test)(\(|:| )" | sed 's/^[a-f0-9]* //' || true)

# --- Build new section ---
NEW_SECTION="## v${NEXT} (${TODAY})\n"
append_section() {
  local heading="$1" entries="$2"
  [ -z "$entries" ] && return
  NEW_SECTION="${NEW_SECTION}\n### ${heading}\n"
  while IFS= read -r line; do
    NEW_SECTION="${NEW_SECTION}- ${line}\n"
  done <<< "$entries"
}

append_section "Features"    "$FEATS"
append_section "Fixes"       "$FIXES"
append_section "Docs"        "$DOCS"
append_section "Refactoring" "$REFACTOR"
append_section "Chores"      "$CHORE"
append_section "Tests"       "$TEST"
append_section "Other"       "$OTHER"

# --- Write changelog ---
if [ ! -f "$CHANGELOG" ]; then
  printf '# Changelog\n' > "$CHANGELOG"
fi

EXISTING_BODY=$(tail -n +2 "$CHANGELOG" | sed '/./,$!d')
printf '# Changelog\n\n%b\n%s\n' "$NEW_SECTION" "$EXISTING_BODY" > "$CHANGELOG"

echo "Generated v${NEXT} section in ${CHANGELOG}"
echo ""
echo "Next steps:"
echo "  1. Review and edit ${CHANGELOG}"
echo "  2. cd packages/verify && npm version ${BUMP} -m \"chore(verify): release %s\""
echo "  3. git push origin main --follow-tags"
