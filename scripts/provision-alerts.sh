#!/usr/bin/env bash
# tva
# Provision Coralogix alerting rules for WRL production monitoring.
# Idempotent: safe to run multiple times. Uses list-then-upsert with [WRL] name prefix.
#
# Usage:
#   ./scripts/provision-alerts.sh            # provision all alerts
#   ./scripts/provision-alerts.sh --dry-run  # show what would be created/updated
#
# Prerequisites:
#   - WRL_CORALOGIX_API_KEY in ~/.secrets
#   - jq installed
#   - curl installed

set -euo pipefail

# Source secrets, then disable trace to prevent key leakage
# shellcheck source=/dev/null
source ~/.secrets
set +x 2>/dev/null

readonly API_BASE="https://api.eu2.coralogix.com/mgmt/openapi/latest/alerts/alerts-general/v3"
readonly API_KEY="${WRL_CORALOGIX_API_KEY:?WRL_CORALOGIX_API_KEY not set in ~/.secrets}"
readonly OPERATOR_EMAIL="bp@ben-peter.com"
if [ -n "${1:-}" ] && [ "${1:-}" != "--dry-run" ]; then
  echo "ERROR: Unknown argument: $1. Usage: $0 [--dry-run]" >&2
  exit 1
fi
readonly DRY_RUN="${1:-}"

# Redact API key in all output
log() { echo "$@"; }
err() { echo "ERROR: $*" >&2; }

# --- Alert Definitions ---

capture_failures_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Capture Failures",
    "description": "More than 3 terminal capture failures in a 5-minute window. Counts capture.fail events only (after all retry attempts exhausted). Excludes retryable capture.stage.fail events.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P1",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"capture.fail\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "capture"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 3,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_5_OR_UNSPECIFIED"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P1"}
      }]
    },
    "notificationGroup": {
      "webhooks": [{
        "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
        "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
        "minutes": 60
      }]
    }
  }
}
ALERT_JSON
}

tsa_failures_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] TSA Failures",
    "description": "More than 2 RFC 3161 timestamp failures in 10 minutes. TSA failure degrades captures (no timestamp) but captures still succeed. Indicates Sectigo TSA service issues.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P3",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"capture.tsa_fail\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "capture"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 2,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_10"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P3"}
      }]
    },
    "notificationGroup": {
      "webhooks": [{
        "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
        "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
        "minutes": 60
      }]
    }
  }
}
ALERT_JSON
}

auth_failure_spike_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Auth Failure Spike",
    "description": "More than 3 authentication failures in 15 minutes (~12/hour). May indicate credential stuffing, misconfigured client, or revoked key still in use.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P1",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"security.auth_fail\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "security"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 3,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_15"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P1"}
      }]
    },
    "notificationGroup": {
      "webhooks": [{
        "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
        "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
        "minutes": 60
      }]
    }
  }
}
ALERT_JSON
}

worker_errors_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Worker Errors (5xx)",
    "description": "More than 2 HTTP 5xx responses in 5 minutes. Indicates worker code bugs or infrastructure issues. 4xx responses (rate limits, auth failures, not found) are excluded.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P1",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "responseStatus:[500 TO *]",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 2,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_5_OR_UNSPECIFIED"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P1"}
      }]
    },
    "notificationGroup": {
      "webhooks": [{
        "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
        "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
        "minutes": 60
      }]
    }
  }
}
ALERT_JSON
}

# --- Core Logic ---

# Fetch all existing alerts and extract [WRL] ones
fetch_existing_alerts() {
  local response http_code
  response=$(curl -s -w '\n%{http_code}' -X GET "$API_BASE" \
    -H "Authorization: $API_KEY" \
    -H "Content-Type: application/json")
  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')
  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    err "Failed to list existing alerts: HTTP $http_code: $response"
    return 1
  fi
  echo "$response"
}

# Find alert ID by name from the existing alerts JSON
find_alert_id() {
  local alerts_json="$1" name="$2"
  echo "$alerts_json" | jq -r --arg name "$name" \
    '.alertDefs[]? | select(.alertDefProperties.name == $name) | .id // empty'
}

# Create or update a single alert
upsert_alert() {
  local name="$1" payload_fn="$2" existing_alerts="$3"
  local payload existing_id response

  # Generate payload with actual email
  payload=$(${payload_fn} | sed "s|OPERATOR_EMAIL_PLACEHOLDER|$OPERATOR_EMAIL|g")

  # Validate JSON structure
  if ! echo "$payload" | jq . > /dev/null 2>&1; then
    err "Invalid JSON payload for '$name'"
    return 1
  fi

  existing_id=$(find_alert_id "$existing_alerts" "$name")

  if [ "$DRY_RUN" = "--dry-run" ]; then
    if [ -n "$existing_id" ]; then
      log "[DRY-RUN] [UPDATE] $name (id: $existing_id)"
    else
      log "[DRY-RUN] [CREATE] $name"
    fi
    # Show payload with API key redacted
    echo "$payload" | jq .
    return 0
  fi

  if [ -n "$existing_id" ]; then
    # Check if update is needed by comparing key fields
    local existing_desc existing_query existing_threshold
    existing_desc=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.description // ""')
    existing_query=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.logsThreshold.logsFilter.simpleFilter.luceneQuery // ""')
    existing_threshold=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.logsThreshold.rules[0].condition.threshold // 0')

    local new_desc new_query new_threshold
    new_desc=$(echo "$payload" | jq -r '.alertDefProperties.description')
    new_query=$(echo "$payload" | jq -r '.alertDefProperties.logsThreshold.logsFilter.simpleFilter.luceneQuery')
    new_threshold=$(echo "$payload" | jq -r '.alertDefProperties.logsThreshold.rules[0].condition.threshold')

    if [ "$existing_desc" = "$new_desc" ] && [ "$existing_query" = "$new_query" ] && [ "$existing_threshold" = "$new_threshold" ]; then
      log "[UNCHANGED] $name (id: $existing_id)"
      return 0
    fi

    # Update: PUT with id at top level
    local update_payload
    update_payload=$(echo "$payload" | jq --arg id "$existing_id" '. + {id: $id}')

    local http_code
    response=$(curl -s -w '\n%{http_code}' -X PUT "$API_BASE" \
      -H "Authorization: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$update_payload")
    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')
    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
      err "Failed to update alert '$name' (id: $existing_id): HTTP $http_code: $response"
      return 1
    fi
    log "[UPDATE] $name (id: $existing_id)"
  else
    # Create: POST
    local http_code
    response=$(curl -s -w '\n%{http_code}' -X POST "$API_BASE" \
      -H "Authorization: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$payload")
    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')
    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
      err "Failed to create alert '$name': HTTP $http_code: $response"
      return 1
    fi
    local new_id
    new_id=$(echo "$response" | jq -r '.alertDef.id // "unknown"')
    log "[CREATE] $name (id: $new_id)"
  fi
}

# --- Main ---

main() {
  if [ "$DRY_RUN" = "--dry-run" ]; then
    log "=== DRY RUN — no changes will be made ==="
    log ""
  fi

  log "Fetching existing alerts..."
  local existing_alerts
  existing_alerts=$(fetch_existing_alerts) || exit 1

  local existing_count
  existing_count=$(echo "$existing_alerts" | jq '.alertDefs | length // 0')
  log "Found $existing_count existing alert(s)"
  log ""

  local failed=0

  upsert_alert "[WRL] Capture Failures"      capture_failures_payload     "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] TSA Failures"           tsa_failures_payload         "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] Auth Failure Spike"     auth_failure_spike_payload   "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] Worker Errors (5xx)"    worker_errors_payload        "$existing_alerts" || ((failed++))

  log ""
  if [ "$failed" -gt 0 ]; then
    err "$failed alert(s) failed to provision"
    exit 1
  fi
  log "All 4 alerts provisioned successfully."
}

main
