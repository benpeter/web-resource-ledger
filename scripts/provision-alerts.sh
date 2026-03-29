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
#   - WRL_CORALOGIX_WEBHOOK_SECRET in ~/.secrets  (Bearer token sent to the WRL webhook endpoint)
#   - jq installed
#   - curl installed

set -euo pipefail

# Source secrets, then disable trace to prevent key leakage
# shellcheck source=/dev/null
source ~/.secrets
set +x 2>/dev/null

readonly CORALOGIX_API_EU2="https://api.eu2.coralogix.com"
readonly API_BASE="${CORALOGIX_API_EU2}/mgmt/openapi/latest/alerts/alerts-general/v3"
readonly WEBHOOKS_BASE="${CORALOGIX_API_EU2}/mgmt/openapi/latest/integrations/webhooks/v1"
readonly API_KEY="${WRL_CORALOGIX_API_KEY:?WRL_CORALOGIX_API_KEY not set in ~/.secrets}"
readonly WEBHOOK_SECRET="${WRL_CORALOGIX_WEBHOOK_SECRET:?WRL_CORALOGIX_WEBHOOK_SECRET not set in ~/.secrets}"
readonly OPERATOR_EMAIL="bp@ben-peter.com"
readonly WEBHOOK_NAME="WRL Alert Receiver"
# Production webhook URL (staging is not wired -- staging traffic must not trigger production automation)
readonly WEBHOOK_TARGET_URL="https://api.webresourceledger.com/v1/webhooks/coralogix"

if [ -n "${1:-}" ] && [ "${1:-}" != "--dry-run" ]; then
  echo "ERROR: Unknown argument: $1. Usage: $0 [--dry-run]" >&2
  exit 1
fi
readonly DRY_RUN="${1:-}"

# Redact API key in all output
log() { echo "$@" >&2; }
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
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
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

threat_check_quarantines_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Threat Check Quarantines",
    "description": "More than 5 URL quarantine events in 24 hours. Indicates the daily re-scan is finding previously-captured URLs that have since been flagged as threats. High volume may indicate a targeted campaign or systematic abuse of a tenant.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P3",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"threatcheck.quarantine\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "security"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 5,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_HOURS_24"}
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

threat_check_api_failures_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Threat Check API Failures",
    "description": "More than 2 Web Risk API failures in 10 minutes during pre-capture checks. Pre-capture failures cause captures to be rejected with an error response. Excludes rescan-context failures (those degrade silently and are lower severity).",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P2",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"threatcheck.api_fail\" AND context:\"pre_capture\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "security"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 2,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_10"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P2"}
      }]
    },
    "notificationGroup": {
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
    }
  }
}
ALERT_JSON
}

qualified_tsa_failures_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Qualified TSA Failures",
    "description": "More than 2 qualified (eIDAS) TSA failures in 10 minutes. Qualified timestamp failure means eIDAS-enabled captures complete without a qualified timestamp, degrading their legal evidentiary value. Indicates Sectigo qualified TSA service issues, auth credential problems, or network errors.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P2",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"capture.qtsa_fail\"",
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
        "override": {"priority": "ALERT_DEF_PRIORITY_P2"}
      }]
    },
    "notificationGroup": {
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
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
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
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
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
    }
  }
}
ALERT_JSON
}

email_delivery_failures_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Email Delivery Failures",
    "description": "More than 5 email send failures in 30 minutes. Indicates the email dispatch system (email.send_fail events) is unable to deliver notification emails to recipients. May indicate provider outage, credential failure, or rate limiting.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P2",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"email.send_fail\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "email"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 5,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_30"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P2"}
      }]
    },
    "notificationGroup": {
      "webhooks": [
        {
          "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        },
        {
          "integration": {"integrationId": WEBHOOK_INTEGRATION_ID_PLACEHOLDER},
          "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
          "minutes": 60
        }
      ]
    }
  }
}
ALERT_JSON
}

new_api_key_created_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] New API Key Created",
    "description": "Any successful API key creation (admin.key_create with responseStatus:201). Fires immediately on every creation — threshold is 0. Notification includes tenantId, name, scopes, and keyHashPrefix so the operator can confirm the key matches expected provisioning without logging into Coralogix.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P4",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"admin.key_create\" AND responseStatus:201",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "admin"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 0,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_MINUTES_5_OR_UNSPECIFIED"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P4"}
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

email_bounces_payload() {
  cat <<'ALERT_JSON'
{
  "alertDefProperties": {
    "name": "[WRL] Email Bounces",
    "description": "More than 3 hard email bounces in 24 hours. Hard bounces (email.bounce events with bounceType:hard) indicate permanently undeliverable addresses. Accumulating hard bounces can damage sender reputation and trigger provider blocks.",
    "type": "ALERT_DEF_TYPE_LOGS_THRESHOLD",
    "enabled": true,
    "priority": "ALERT_DEF_PRIORITY_P3",
    "logsThreshold": {
      "logsFilter": {
        "simpleFilter": {
          "luceneQuery": "event:\"email.bounce\" AND bounceType:\"hard\"",
          "labelFilters": {
            "applicationName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "wrl"}],
            "subsystemName": [{"operation": "LOG_FILTER_OPERATION_TYPE_IS_OR_UNSPECIFIED", "value": "email"}]
          }
        }
      },
      "rules": [{
        "condition": {
          "conditionType": "LOGS_THRESHOLD_CONDITION_TYPE_MORE_THAN_OR_UNSPECIFIED",
          "threshold": 3,
          "timeWindow": {"logsTimeWindowSpecificValue": "LOGS_TIME_WINDOW_VALUE_HOURS_24"}
        },
        "override": {"priority": "ALERT_DEF_PRIORITY_P3"}
      }]
    },
    "notificationGroup": {
      "webhooks": [{
        "integration": {"recipients": {"emails": ["OPERATOR_EMAIL_PLACEHOLDER"]}},
        "notifyOn": "NOTIFY_ON_TRIGGERED_AND_RESOLVED",
        "minutes": 1440
      }]
    }
  }
}
ALERT_JSON
}

# --- Webhook Integration Logic ---

# List all outgoing webhooks and return the raw JSON response
fetch_existing_webhooks() {
  local response http_code
  response=$(curl -s -w '\n%{http_code}' -X GET "$WEBHOOKS_BASE" \
    -H "Authorization: $API_KEY" \
    -H "Content-Type: application/json")
  http_code=$(echo "$response" | tail -1)
  response=$(echo "$response" | sed '$d')
  if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
    err "Failed to list existing webhooks: HTTP $http_code: $response"
    return 1
  fi
  echo "$response"
}

# Find a webhook's string ID (uuid) by name from the list response
find_webhook_id() {
  local webhooks_json="$1" name="$2"
  echo "$webhooks_json" | jq -r --arg name "$name" \
    '.deployed[]? | select(.name == $name) | .id // empty'
}

# Find a webhook's externalId (integer) by name -- used as integrationId in alert payloads
find_webhook_external_id() {
  local webhooks_json="$1" name="$2"
  echo "$webhooks_json" | jq -r --arg name "$name" \
    '.deployed[]? | select(.name == $name) | .externalId // empty'
}

# Build the generic webhook creation/update data object (shared between create and update)
webhook_data_payload() {
  # payload field: JSON string with Coralogix template variables.
  # Variable reference: $ALERT_ID, $ALERT_NAME, $ALERT_ACTION, $ALERT_URL,
  #   $HIT_COUNT, $APPLICATION_NAME, $SUBSYSTEM_NAME, $EVENT_SEVERITY
  # $ALERT_ACTION is "trigger" or "resolve" -- Coralogix uses present tense without -d suffix.
  local webhook_uuid
  webhook_uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
  jq -n \
    --arg name    "$WEBHOOK_NAME" \
    --arg url     "$WEBHOOK_TARGET_URL" \
    --arg secret  "$WEBHOOK_SECRET" \
    --arg uuid    "$webhook_uuid" \
    '{
      "name": $name,
      "type": "GENERIC",
      "url":  $url,
      "genericWebhook": {
        "uuid": $uuid,
        "method": "POST",
        "headers": {
          "Content-Type":  "application/json",
          "Authorization": ("Bearer " + $secret)
        },
        "payload": "{\"alert_id\":\"$ALERT_ID\",\"alert_name\":\"$ALERT_NAME\",\"alert_action\":\"$ALERT_ACTION\",\"alert_url\":\"$ALERT_URL\",\"hit_count\":\"$HIT_COUNT\",\"application_name\":\"$APPLICATION_NAME\",\"subsystem_name\":\"$SUBSYSTEM_NAME\",\"event_severity\":\"$EVENT_SEVERITY\"}"
      }
    }'
}

# Create or update the "WRL Alert Receiver" generic outbound webhook.
# Prints the externalId (integer) on success -- callers use it as integrationId in alerts.
create_webhook_integration() {
  local existing_webhooks existing_id external_id

  log "Fetching existing webhook integrations..."
  existing_webhooks=$(fetch_existing_webhooks) || return 1

  existing_id=$(find_webhook_id "$existing_webhooks" "$WEBHOOK_NAME")

  if [ "$DRY_RUN" = "--dry-run" ]; then
    if [ -n "$existing_id" ]; then
      external_id=$(find_webhook_external_id "$existing_webhooks" "$WEBHOOK_NAME")
      log "[DRY-RUN] [UPDATE] Webhook '$WEBHOOK_NAME' (id: $existing_id, externalId: $external_id)"
    else
      log "[DRY-RUN] [CREATE] Webhook '$WEBHOOK_NAME' -> $WEBHOOK_TARGET_URL"
    fi
    webhook_data_payload | jq '{data: .}' >&2
    # Return a placeholder external ID so dry-run can continue to show alert payloads
    echo "0"
    return 0
  fi

  local data_payload response http_code
  data_payload=$(webhook_data_payload)

  if [ -n "$existing_id" ]; then
    # Update: PUT with id + data
    local update_payload
    update_payload=$(echo "$data_payload" | jq --arg id "$existing_id" '{id: $id, data: .}')

    response=$(curl -s -w '\n%{http_code}' -X PUT "$WEBHOOKS_BASE" \
      -H "Authorization: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$update_payload")
    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')
    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
      err "Failed to update webhook '$WEBHOOK_NAME' (id: $existing_id): HTTP $http_code: $response"
      return 1
    fi
    external_id=$(find_webhook_external_id "$existing_webhooks" "$WEBHOOK_NAME")
    log "[UPDATE] Webhook '$WEBHOOK_NAME' (id: $existing_id, externalId: $external_id)"
  else
    # Create: POST with data wrapper
    local create_payload
    create_payload=$(echo "$data_payload" | jq '{data: .}')

    response=$(curl -s -w '\n%{http_code}' -X POST "$WEBHOOKS_BASE" \
      -H "Authorization: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$create_payload")
    http_code=$(echo "$response" | tail -1)
    response=$(echo "$response" | sed '$d')
    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
      err "Failed to create webhook '$WEBHOOK_NAME': HTTP $http_code: $response"
      return 1
    fi
    # Newly created webhook: re-fetch to get externalId (create response only returns id)
    local new_uuid
    new_uuid=$(echo "$response" | jq -r '.id // "unknown"')
    local refreshed_webhooks
    refreshed_webhooks=$(fetch_existing_webhooks) || return 1
    external_id=$(find_webhook_external_id "$refreshed_webhooks" "$WEBHOOK_NAME")
    log "[CREATE] Webhook '$WEBHOOK_NAME' (id: $new_uuid, externalId: $external_id)"
  fi

  if [ -z "$external_id" ]; then
    err "Could not determine externalId for webhook '$WEBHOOK_NAME' -- cannot wire alerts"
    return 1
  fi
  echo "$external_id"
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

# Create or update a single alert.
# $4 (optional) -- numeric externalId of the outbound webhook integration.
#   When provided, WEBHOOK_INTEGRATION_ID_PLACEHOLDER in the payload is replaced
#   with this value to wire the webhook notification. Omit for email-only alerts.
upsert_alert() {
  local name="$1" payload_fn="$2" existing_alerts="$3" webhook_integration_id="${4:-}"
  local payload existing_id response

  # Generate payload: substitute email, then optionally substitute webhook integration ID
  payload=$(${payload_fn} | sed "s|OPERATOR_EMAIL_PLACEHOLDER|$OPERATOR_EMAIL|g")
  if [ -n "$webhook_integration_id" ]; then
    payload=$(echo "$payload" | sed "s|WEBHOOK_INTEGRATION_ID_PLACEHOLDER|$webhook_integration_id|g")
  fi

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
    # Check if update is needed by comparing key fields (including notification group size,
    # which changes when a webhook integration is added to an existing email-only alert)
    local existing_desc existing_query existing_threshold existing_webhook_count
    existing_desc=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.description // ""')
    existing_query=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.logsThreshold.logsFilter.simpleFilter.luceneQuery // ""')
    existing_threshold=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.logsThreshold.rules[0].condition.threshold // 0')
    existing_webhook_count=$(echo "$existing_alerts" | jq -r --arg name "$name" \
      '.alertDefs[]? | select(.alertDefProperties.name == $name) | .alertDefProperties.notificationGroup.webhooks | length // 0')

    local new_desc new_query new_threshold new_webhook_count
    new_desc=$(echo "$payload" | jq -r '.alertDefProperties.description')
    new_query=$(echo "$payload" | jq -r '.alertDefProperties.logsThreshold.logsFilter.simpleFilter.luceneQuery')
    new_threshold=$(echo "$payload" | jq -r '.alertDefProperties.logsThreshold.rules[0].condition.threshold')
    new_webhook_count=$(echo "$payload" | jq -r '.alertDefProperties.notificationGroup.webhooks | length // 0')

    if [ "$existing_desc" = "$new_desc" ] && [ "$existing_query" = "$new_query" ] && \
       [ "$existing_threshold" = "$new_threshold" ] && [ "$existing_webhook_count" = "$new_webhook_count" ]; then
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

  # Step 1: provision the outbound webhook integration and capture its externalId.
  # The externalId is the numeric integrationId referenced by alert notification groups.
  local webhook_integration_id
  webhook_integration_id=$(create_webhook_integration) || exit 1
  log ""

  # Step 2: provision alerts.
  log "Fetching existing alerts..."
  local existing_alerts
  existing_alerts=$(fetch_existing_alerts) || exit 1

  local existing_count
  existing_count=$(echo "$existing_alerts" | jq '.alertDefs | length // 0')
  log "Found $existing_count existing alert(s)"
  log ""

  local failed=0

  # Alerts that trigger active investigation -- wired to both email and the webhook receiver.
  upsert_alert "[WRL] Capture Failures"           capture_failures_payload          "$existing_alerts" "$webhook_integration_id" || ((failed++))
  upsert_alert "[WRL] Qualified TSA Failures"     qualified_tsa_failures_payload    "$existing_alerts" "$webhook_integration_id" || ((failed++))
  upsert_alert "[WRL] Auth Failure Spike"         auth_failure_spike_payload        "$existing_alerts" "$webhook_integration_id" || ((failed++))
  upsert_alert "[WRL] Worker Errors (5xx)"        worker_errors_payload             "$existing_alerts" "$webhook_integration_id" || ((failed++))
  upsert_alert "[WRL] Threat Check API Failures"  threat_check_api_failures_payload "$existing_alerts" "$webhook_integration_id" || ((failed++))
  upsert_alert "[WRL] Email Delivery Failures"    email_delivery_failures_payload   "$existing_alerts" "$webhook_integration_id" || ((failed++))

  # Filtered / informational alerts -- email-only, no webhook receiver.
  upsert_alert "[WRL] TSA Failures"               tsa_failures_payload              "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] Threat Check Quarantines"   threat_check_quarantines_payload  "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] Email Bounces"              email_bounces_payload             "$existing_alerts" || ((failed++))
  upsert_alert "[WRL] New API Key Created"        new_api_key_created_payload       "$existing_alerts" || ((failed++))

  log ""
  if [ "$failed" -gt 0 ]; then
    err "$failed alert(s) failed to provision"
    exit 1
  fi
  log "All 10 alerts provisioned successfully."
}

main
