#!/bin/bash
# Generate favicon.ico from favicon.svg
# Requires: ImageMagick (brew install imagemagick)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

convert "$REPO_ROOT/src/assets/favicon.svg" -resize 16x16 /tmp/favicon-16.png
convert "$REPO_ROOT/src/assets/favicon.svg" -resize 32x32 /tmp/favicon-32.png
convert /tmp/favicon-16.png /tmp/favicon-32.png "$REPO_ROOT/src/assets/favicon.ico"
rm /tmp/favicon-16.png /tmp/favicon-32.png
echo "Generated $REPO_ROOT/src/assets/favicon.ico"
