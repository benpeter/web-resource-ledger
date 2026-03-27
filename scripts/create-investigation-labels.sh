#!/usr/bin/env bash
# Create GitHub labels for the auto-investigation system.
# Idempotent: --force is a no-op when the label already exists with the same values.
set -euo pipefail

# Alert type labels -- one per runbook
gh label create "alert:capture-failures"          --color "1d76db" --description "Auto-investigation: Capture Failures"          --force
gh label create "alert:qualified-tsa-failures"    --color "1d76db" --description "Auto-investigation: Qualified TSA Failures"    --force
gh label create "alert:auth-failure-spike"        --color "1d76db" --description "Auto-investigation: Auth Failure Spike"        --force
gh label create "alert:worker-errors-5xx"          --color "1d76db" --description "Auto-investigation: Worker Errors (5xx)"       --force
gh label create "alert:threat-check-api-failures" --color "1d76db" --description "Auto-investigation: Threat Check API Failures" --force
gh label create "alert:email-delivery-failures"   --color "1d76db" --description "Auto-investigation: Email Delivery Failures"   --force

# Meta label applied to every auto-investigated issue
gh label create "auto-investigated" --color "ededed" --description "Created by auto-investigation system" --force

echo "Labels created (or already exist)."
