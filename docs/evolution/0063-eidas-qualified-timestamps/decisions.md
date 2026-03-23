# Decisions: eIDAS Qualified Timestamps

## PATCH vs PUT for /v1/account/settings

**Chosen**: PATCH with field allowlist and merge semantics
**Over**: PUT with full replacement (frontend-minion, data-minion preference)
**Why**: PATCH is safer for a settings surface that will grow -- clients send only the field being changed, eliminating the risk of accidentally clearing future settings. The frontend sends `{ qualifiedTimestamps: true }` regardless, so the HTTP method is the only semantic difference.

## Dedicated column vs config JSON for eIDAS flag

**Chosen**: Dedicated `eidas_qualified` INTEGER column on `tenants` table
**Over**: Storing in the existing `config` JSON blob (api-design-minion)
**Why**: The config JSON is admin-only (`setTenantConfig`). Mixing self-serve and admin fields creates a read-modify-write hazard where a session user could overwrite admin config. A dedicated column is directly indexable for meter reporter queries and avoids JSON parsing on the hot path.

## Single base64 auth secret vs separate username/password

**Chosen**: Single `QUALIFIED_TSA_AUTH` pre-encoded base64 string
**Over**: Separate `QTSA_USERNAME` and `QTSA_PASSWORD` secrets (mcp-minion)
**Why**: Fewer secrets to manage, simpler code (one env lookup, no runtime concatenation), follows the existing `SIGNING_KEY` pattern of single-value secrets.

## Sequential vs parallel TSA calls

**Chosen**: Sequential (standard DigiCert first, then qualified)
**Over**: Parallel with Promise.all (api-design-minion)
**Why**: Standard timestamp is the baseline that must succeed independently. Sequential ensures the standard timestamp is complete before the qualified attempt. Avoids potential Sectigo rate-limiting from concurrent requests. Wall-time addition bounded by 5s qualified timeout.

## eIDAS flag read timing: enqueue vs queue consumer

**Chosen**: Read at enqueue time, embed in queue message body
**Over**: Read at queue consumer time with fresh D1 query
**Why**: Avoids extra D1 query on the capture hot path. Makes behavior deterministic -- the flag value at request time is the contractual intent. A tenant who disables eIDAS after submitting a capture won't retroactively lose the qualified timestamp they expected.

## Endpoint path: /v1/account/settings

**Chosen**: `/v1/account/settings`
**Over**: `/v1/tenant/settings` (issue description)
**Why**: The existing session-gated namespace is `/v1/account/*` (keys, tos, usage, billing). Using a different prefix would require a new auth gate or break the convention.

## Qualified TSA timeout: 5s

**Chosen**: 5000ms timeout for the qualified TSA call
**Over**: 3000ms (issue spec) and 15000ms (mcp-minion recommendation)
**Why**: 3s may be too tight for qualified TSAs that include full certificate chains in their responses. 15s is excessive for a fallback path -- it would block the capture pipeline unreasonably. 5s is a pragmatic middle ground. **This deviates from the issue spec's "3s timeout"** -- the gru reviewer noted that Sectigo recommends 15s between requests, and qualified TSA responses are typically larger. Adjust based on real latency data post-launch.

## Signature type string

**Chosen**: `rfc3161_qualified` (underscore)
**Over**: `rfc3161-qualified` (hyphen, mcp-minion)
**Why**: The broader codebase uses underscores in compound identifiers (`capture_count`, `reported_capture_count`). Underscores are also safer in URL query parameters and JSON path expressions.

## Billing model: report all, Stripe handles free tier

**Chosen**: Meter reporter reports ALL eIDAS captures; Stripe graduated pricing gives first 50 free
**Over**: Reporter filtering out free-tier captures before reporting
**Why**: Matches the existing pattern where the captures meter reports all captures and Stripe pricing gives the first 200 free. Simpler code, single source of truth for pricing in Stripe.
