#!/usr/bin/env bash
set -euo pipefail

PKG_VERSION=$(jq -r .version package.json)
API_VERSION=$(grep -m1 '^  version:' openapi.yaml | awk '{print $2}')

if [ "$PKG_VERSION" != "$API_VERSION" ]; then
  echo "::error::Version mismatch: package.json=$PKG_VERSION, openapi.yaml=$API_VERSION"
  exit 1
fi

echo "Versions in sync: $PKG_VERSION"
