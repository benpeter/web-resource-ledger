---
name: ops-runbook
description: WRL operational procedures — tenant management, D1 queries, secret rotation, Coralogix, Resend, Stripe, captures, deploys. Use when performing any admin or operational task on WRL infrastructure.
disable-user-invocation: true
---

# WRL Operations Runbook

Reference procedures for operating the WRL (Web Resource Ledger) system.
All commands assume you are in the repo root.

**Staleness notice:** These procedures were mined from session logs (March 2026).
If a command fails, a table name is wrong, an endpoint returns unexpected results,
or the procedure no longer matches the codebase — tell the human. Say what failed
and suggest the update needed. This runbook is only useful if it stays accurate.

## Prerequisites

```bash
# Always unset before any wrangler command (conflicts with OAuth auth)
unset CLOUDFLARE_API_TOKEN

# Load secrets for API calls
source ~/.wrl-keys    # WRL-specific keys (staging + prod, prefixed)
source ~/.secrets     # General secrets (Coralogix API key, etc.)
```

## Environment conventions

| | Production | Staging |
|---|---|---|
| API host | `api.webresourceledger.com` | `staging.webresourceledger.com` |
| Verify host | `verify.webresourceledger.com` | `verify-staging.webresourceledger.com` |
| D1 database | `wrl-metadata` | `wrl-metadata-staging` |
| wrangler `--env` | *(omit)* | `--env staging` |
| Admin key var | `$WRL_PROD_ADMIN_KEY` | `$WRL_STAGING_ADMIN_KEY` |
| Capture key var | `$WRL_PROD_CAPTURE_API_KEY` | `$WRL_STAGING_CAPTURE_API_KEY` |

**Note:** The old staging URL `wrl-staging.benpeter.workers.dev` no longer works
(returns 404). Custom domains replaced it in Phase 0068.

---

## Tenant management

### Reset a tenant's capture count

```bash
# Check current count
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT tenant_id, period, capture_count, reported_capture_count \
             FROM usage_counters WHERE tenant_id = '<TENANT>' AND period = '<YYYY-MM>'"

# Set to specific value
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "UPDATE usage_counters SET capture_count = <N>, reported_capture_count = <N> \
             WHERE tenant_id = '<TENANT>' AND period = '<YYYY-MM>'"
```

Update `reported_capture_count` too, otherwise the next Stripe meter sync reports a delta.

To re-test notifications, also clear the dedup record:

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "DELETE FROM notification_sent \
             WHERE tenant_id = '<TENANT>' AND event_type = 'approaching_limit' AND period = '<YYYY-MM>'"
```

**Gotcha:** `d1 execute` does NOT support multiple statements separated by `;`. Run each as a separate command.

### Change a tenant's notification email

```bash
# Check current state
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT tenant_id, email, email_verified, pending_email \
             FROM notification_preferences WHERE tenant_id = '<TENANT>'"

# Admin override (bypasses verification flow)
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "UPDATE notification_preferences SET email = '<NEW_EMAIL>', email_verified = 1 \
             WHERE tenant_id = '<TENANT>'"
```

Or via admin API:

```bash
source ~/.wrl-keys && curl -sf -X PUT \
  "https://api.webresourceledger.com/v1/admin/tenants/<TENANT>/config" \
  -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"notificationEmail": "<NEW_EMAIL>", "emailVerified": true}'
```

### Force-verify a tenant's email

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "UPDATE notification_preferences SET email_verified = 1 \
             WHERE tenant_id = '<TENANT>'"
```

### Create a new tenant API key

```bash
source ~/.wrl-keys && curl -s -X POST \
  "https://api.webresourceledger.com/v1/admin/keys" \
  -H "Authorization: Bearer $WRL_PROD_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "<TENANT>", "scopes": ["capture", "read"], "name": "<KEY_NAME>"}' | jq .
```

The key and keyHash are returned **once**. Save immediately to 1Password:

```bash
eval $(op signin) && op item create --category "API Credential" --vault WRL \
  --title "Tenant: <TENANT>" \
  "PRODUCTION_API_KEY=<KEY>" "PRODUCTION_KEY_HASH=<HASH>"
```

### List all tenants

```bash
# Via D1 (most detail)
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT id, tier, billing_status FROM tenants"

# GitHub OAuth users
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT github_login, tenant_id, created_at FROM github_users"
```

### Query tenant billing state

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT id, tier, payment_method_added_at, billing_status, grace_period_end \
             FROM tenants WHERE id = '<TENANT>'"
```

---

## Captures

### Run a test capture

```bash
source ~/.wrl-keys && curl -s -X POST \
  "https://api.webresourceledger.com/v1/captures" \
  -H "Authorization: Bearer $WRL_PROD_CAPTURE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' | jq .
```

Auth header is `Authorization: Bearer <key>` (not `X-API-Key`).

### Poll capture status

```bash
curl -s "https://api.webresourceledger.com/v1/captures/<CAPTURE_ID>/status" \
  -H "Authorization: Bearer $WRL_PROD_CAPTURE_API_KEY" | jq '{status, durationMs}'
```

Captures take 15-30s. Simple sites (example.com) are fast; complex sites take longer.

### Verify a capture (public, no auth)

```bash
curl -s "https://api.webresourceledger.com/v1/verify/<CAPTURE_ID>" \
  -H "Accept: application/json" | jq '.checks[] | {name, status}'
```

Or open in browser: `open "https://api.webresourceledger.com/v1/verify/<CAPTURE_ID>"`

### Download and inspect a WACZ bundle

```bash
curl -s "https://api.webresourceledger.com/v1/captures/<CAPTURE_ID>/artifacts/wacz" \
  -o /tmp/capture.wacz && unzip -l /tmp/capture.wacz
```

Contents: `archive/data.warc`, `datapackage.json`, `datapackage-digest.json`, `screenshot.png`.

### List failed captures

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT id, url, status, error, created_at FROM captures \
             WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10"
```

---

## Coralogix

### Query logs via curl (always use a temp file)

DataPrime syntax uses `$` for field access, which conflicts with shell
variable expansion. **Always write the query to a temp file** — inline
`-d '{...}'` is a quoting minefield.

```bash
# 1. Write query to temp file
cat > /tmp/cx-query.json << 'EOF'
{
  "query": "source logs | filter $l.applicationname == 'wrl' && $l.subsystemname == 'email' | limit 20",
  "metadata": {
    "startDate": "2026-03-25T15:00:00.000Z",
    "endDate": "2026-03-25T16:00:00.000Z",
    "tier": "TIER_FREQUENT_SEARCH"
  }
}
EOF

# 2. Run query
source ~/.secrets && curl -s -X POST \
  "https://ng-api-http.eu2.coralogix.com/api/v1/dataprime/query" \
  -H "Authorization: Bearer $WRL_CORALOGIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/cx-query.json
```

**Important:** Use `<< 'EOF'` (quoted heredoc) so the shell does NOT expand
`$l`, `$d`, `$m` — those are DataPrime variables, not shell variables. The
`startDate`/`endDate` must be hardcoded ISO strings; use `date -u` to
compute them before writing the file.

### DataPrime syntax gotchas

| What you want | Wrong | Right |
|---|---|---|
| Regex match | `$d.event =~ 'email'` | `$d.event ~~ 'email'` (but see below) |
| Free-text search | `$d.event ~~ 'email'` | `$d ~~ 'email'` (`~~` only works on `$d`, not subfields) |
| Field equality | `$d.event == 'capture.success'` | `$d.event == 'capture.success'` ✅ |
| AND | `&&` | `&&` ✅ |
| Subsystem filter | `$l.subsystemname == 'email'` | `$l.subsystemname == 'email'` ✅ |

**`~~` (contains/regex) only works on `$d`** (the full userData blob), not on
individual fields like `$d.event`. For field-level matching, use `==` with the
exact value. For substring search across all fields, use `$d ~~ 'pattern'`.

### Response parsing

The API returns newline-delimited JSON. Each line has a `result.results[]`
array. Parse with:

```python
# Pipe curl output to this
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
        for r in obj.get('result',{}).get('results',[]):
            ts = [m['value'] for m in r.get('metadata',[]) if m['key']=='timestamp'][0][:19]
            sub = [l['value'] for l in r.get('labels',[]) if l['key']=='subsystemname'][0]
            ud = r.get('userData','')[:300]
            print(f'{ts} [{sub}] {ud}')
    except: pass
```

### WRL subsystem names

| Subsystem | Events |
|---|---|
| `capture` | `capture.submit`, `capture.success`, `capture.fail`, `capture.list` |
| `email` | `email.dispatch_suppressed`, `email.dispatch_error`, `email.send_success`, `email.send_fail`, `email.verify_send`, `email.verify_success` |
| `security` | `security.rate_limit`, `security.auth_fail` |
| `verify` | `verify.request` |
| `schedule` | `schedule.tick_empty`, `schedule.tick` |
| `admin` | `admin.tenant_config_updated` |
| `billing` | `billing.meter_report` |

### Common queries

```
# All email events for a tenant (last hour)
source logs | filter $l.applicationname == 'wrl' && $l.subsystemname == 'email' | limit 50

# All events for a specific tenant (free-text search on userData)
source logs | filter $l.applicationname == 'wrl' && $d ~~ 'gh-398734' | limit 30

# Failed captures
source logs | filter $l.applicationname == 'wrl' && $d.event == 'capture.fail' | limit 20

# Rate limit hits
source logs | filter $l.applicationname == 'wrl' && $d.event == 'security.rate_limit' | limit 20
```

**Keys:** Use `$WRL_CORALOGIX_API_KEY` (personal, all perms) for querying.
`$WRL_CORALOGIX_SEND_KEY` is ingestion-only and will auth-fail on queries.

### MCP server (when available)

A Coralogix MCP server is configured in `~/.claude.json` but may not always
connect. When it's available, use `mcp__coralogix__query_logs` with DataPrime.
Fall back to the curl approach above when the MCP server is unavailable.

### Auto-investigation results

Coralogix alerts trigger an automated investigation via GitHub Actions + Claude
Code. Before manually investigating, check if an auto-investigation already ran:

```bash
gh issue list --label auto-investigated --state open --limit 5
```

If an issue exists, read its findings before re-investigating.

### Investigate an alert manually

1. Identify alert type from email (`capture.fail`, `capture.tsa_fail`, `security.auth_fail`, 5xx)
2. Query Coralogix for the relevant subsystem and event type
3. Check if it auto-resolved (auth_fail threshold is low — 3 in 15 min)
4. For capture failures, check D1 for failed captures (see above)
5. For auth failures, check if it's a bot scan (single IP, automated user-agent)

---

## Pirsch Analytics

### Query visitor stats (is traffic being recorded?)

The write-only access key (`pa_...`) cannot read stats. Exchange the OAuth
client credentials for a token first. Domain ID for webresourceledger.com
is `0DdKAMZgZ2` (also in `~/.secrets` as `WRL_PIRSCH_DOMAIN_ID`).

```bash
source ~/.secrets
TOKEN=$(curl -s -X POST https://api.pirsch.io/api/v1/token \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$WRL_PIRSCH_CLIENT_ID\",\"client_secret\":\"$WRL_PIRSCH_CLIENT_SECRET\"}" \
  | jq -r .access_token)
curl -s "https://api.pirsch.io/api/v1/statistics/visitor?id=$WRL_PIRSCH_DOMAIN_ID&from=2026-07-01&to=2026-07-13" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[] | "\(.day[:10]) visitors=\(.visitors) views=\(.views)"'
```

An error of `"Domain not found."` usually means the `id` parameter was
empty/wrong, not that the domain is gone — list domains with
`GET /api/v1/domain` using the same token.

### "Didn't receive any traffic" warning emails

Pirsch sends these twice daily (00:00/12:00 UTC) while the domain records
zero traffic (threshold: 1 day). Debug order:

1. Check `pirsch` subsystem in Coralogix (all three apps: `wrl`,
   `wrl-landing`, `wrl-docs`): `pirsch.send_rejected` = Pirsch refused the
   hit (400 = validation, e.g. bot request without User-Agent; 401 = dead
   key). No events at all = sends aren't happening.
2. Check the landing site is actually served BY THE WORKER:
   `curl -sI https://webresourceledger.com/` must show
   `content-security-policy` and `cache-control: private`. If instead you
   see `cf-cache-status: HIT` with `cache-control: public, max-age=0,
   must-revalidate` and no security headers, the deployed Worker version
   lost `assets.run_worker_first` and Cloudflare serves assets directly —
   no tracking, no headers. Root cause July 2026: deploy workflow used
   wrangler-action's bundled wrangler 3.90.0, which silently drops the
   field (fixed in PR #289 by `npm ci` + a post-deploy CSP assertion).
   Verify deployed flag: `GET /accounts/{acct}/workers/scripts/wrl-landing/versions/{id}`
   → `resources.script_runtime.assets.raw_run_worker_first`.
3. Remember Pirsch returns 200 and then silently drops hits it considers
   bot traffic — datacenter IPs and headless UAs never show up in stats.
   Test recovery with a real browser UA from a residential IP.

---

## Resend (email)

### Check recent email deliveries

```bash
source ~/.secrets && curl -s "https://api.resend.com/emails?limit=10" \
  -H "Authorization: Bearer $WRL_RESEND_API_KEY" | jq '.data[] | {id, to, subject, created_at}'
```

### Check domain verification

```bash
source ~/.secrets && curl -s "https://api.resend.com/domains" \
  -H "Authorization: Bearer $WRL_RESEND_API_KEY" | jq '.data[] | {name, status}'
```

### Verify email DNS

```bash
echo "=== SPF ===" && dig webresourceledger.com TXT @1.1.1.1 +short | grep spf
echo "=== DMARC ===" && dig _dmarc.webresourceledger.com TXT @1.1.1.1 +short
echo "=== DKIM ===" && dig resend._domainkey.webresourceledger.com TXT @1.1.1.1 +short | head -1
```

### Check notification dedup (why wasn't email sent?)

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler d1 execute wrl-metadata --remote \
  --command "SELECT * FROM notification_sent WHERE tenant_id = '<TENANT>' ORDER BY sent_at DESC LIMIT 10"
```

If a row exists for the event_type + period, the notification was already sent and dedup prevents re-sending. Delete the row to re-trigger (see "Reset capture count" above).

---

## Stripe

### Look up price ID by lookup key

```bash
source ~/.wrl-keys && curl -s -u "$WRL_PROD_STRIPE_SECRET_KEY:" \
  "https://api.stripe.com/v1/prices/search?query=lookup_key:%27capture_volume_monthly%27" \
  | jq '.data[0].id'
```

Note: Stripe basic auth uses `SECRET_KEY:` (trailing colon, empty password).

### Verify Stripe secrets are deployed

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler secret list 2>&1 | grep -i stripe
npx wrangler secret list --env staging 2>&1 | grep -i stripe
```

### Provision Stripe secrets

```bash
source ~/.wrl-keys && unset CLOUDFLARE_API_TOKEN
echo -n "$WRL_PROD_STRIPE_SECRET_KEY" | npx wrangler secret put STRIPE_SECRET_KEY
echo -n "$WRL_PROD_STRIPE_WEBHOOK_SECRET" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Staging: add --env staging and use $WRL_STAGING_* vars
```

---

## Secrets and infrastructure

### Provision a new secret (full flow)

1. Generate the value
2. Store in 1Password: `eval $(op signin) && op item edit "Production" --vault WRL "FIELD=$VALUE"`
3. Push to Workers: `echo -n "$VALUE" | unset CLOUDFLARE_API_TOKEN && npx wrangler secret put FIELD`
4. Add to `~/.wrl-keys` for local use
5. If needed in CI: `echo -n "$VALUE" | gh secret set FIELD --env production`

Wrap multiple `op` calls in a single script with `eval $(op signin)` for one Touch ID prompt.

### Apply D1 migrations

```bash
# Always pull first so migration files exist locally
git checkout main && git pull --rebase

unset CLOUDFLARE_API_TOKEN
npx wrangler d1 migrations apply DB --remote --env staging
npx wrangler d1 migrations apply DB --remote
```

`migrations apply` takes the **binding name** `DB`. `d1 execute` takes **either** the database name or binding.

CI deploy tokens lack D1 permissions (error 7403). Migrations are always manual.

### Check deployed version

```bash
curl -sf https://api.webresourceledger.com/health | jq '.build'
curl -sf https://staging.webresourceledger.com/health | jq '.build'
```

Compare `.build.commit` against expected merge SHA:

```bash
MERGE_SHA=$(gh pr view <PR> --json mergeCommit --jq '.mergeCommit.oid')
```

### Manual deploy (outside CI)

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler deploy             # production
unset CLOUDFLARE_API_TOKEN && npx wrangler deploy --env staging  # staging
```

### Trigger CI workflows

```bash
gh workflow run "Deploy to Staging" --ref main
gh workflow run "Deploy to Production"
gh workflow run "E2E Tests"
```

### Debug a failed CI run

```bash
gh run list --limit 5
gh run view <RUN_ID> --log-failed 2>&1 | tail -40
gh run view <RUN_ID> --log-failed 2>&1 | grep -E "FAIL|Error|timeout" | head -20
```

### Live worker logs

```bash
unset CLOUDFLARE_API_TOKEN && npx wrangler tail --format pretty
```

---

## D1 tables reference

| Table | Key columns |
|---|---|
| `tenants` | id, tier, billing_status, payment_method_added_at, grace_period_end |
| `github_users` | github_id, github_login, tenant_id, tos_accepted_at |
| `captures` | id, tenant_id, url, status, error, created_at |
| `usage_counters` | tenant_id, period, capture_count, reported_capture_count |
| `notification_preferences` | tenant_id, email, email_verified, pending_email |
| `notification_sent` | tenant_id, event_type, period, sent_at |
| `api_keys` | key_hash, tenant_id, scopes, name, revoked_at |
