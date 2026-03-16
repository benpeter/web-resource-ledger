# Domain Plan Contribution: iac-minion

## Current Infrastructure State

WRL is a pure Cloudflare Workers application with:
- **Compute**: Single Worker (`wrl`) using `@cloudflare/playwright` for Browser Rendering
- **Storage**: R2 bucket (`wrl-captures`) for artifacts, KV namespace for capture status/metadata
- **Auth**: Single static API key via `CAPTURE_API_KEY` env secret (timing-safe comparison)
- **Rate limiting**: Three `unsafe.bindings` rate limiters (per-IP capture at 10/min, per-IP verify at 60/min, global capture at 200/min)
- **Observability**: Structured JSON logs shipped to Coralogix via HTTP ingestion
- **CI**: GitHub Actions running tests + OpenAPI lint on code changes; no CD (manual `wrangler deploy`)
- **No D1, no Queues, no Durable Objects, no Cron Triggers** -- minimal binding surface

---

## Recommendations

### Question 1: Infrastructure Prerequisites for Roadmap Items

**Per-tenant auth: KV is sufficient; D1 is not needed yet.**

The current auth model is a single `CAPTURE_API_KEY` environment secret compared with `crypto.subtle.timingSafeEqual`. Per-tenant keys require storing multiple keys with metadata (tenant ID, scopes, creation date, rotation state). The question is whether this needs D1 or can stay in KV.

KV handles this fine for the foreseeable scale:
- Key count will be low (tens of tenants, not thousands) -- KV list operations are practical at this scale
- Key lookups are by exact key value (hash the API key, use hash as KV key) -- O(1) lookup, no query needed
- Key metadata (tenant ID, scopes, created/rotated dates) fits in KV's value field as JSON
- KV's eventual consistency is acceptable for auth: key rotation has a propagation window of ~60s globally, which is fine when you support overlapping active keys (the backlog already requires this)

The pattern: `kv.get("apikey:<sha256-of-bearer-token>")` returns `{ tenantId, scopes: ["capture", "read"], createdAt, ... }`. This is a hash-based lookup, not a query -- KV is designed for exactly this.

**D1 becomes relevant only when the list/search captures endpoint needs query-by-attribute** (filter by tenant, date range, URL pattern). The backlog already identifies this (`[consider] D1 (edge SQLite) -- if KV becomes limiting for metadata queries`). The trigger is the `GET /v1/captures` list endpoint, not per-tenant auth.

**Dependency chain**: Per-tenant auth keys (KV) --> List endpoint with tenant-scoped results (may trigger D1) --> Per-tenant rate limiting (switches rate limit key from IP to tenant ID, no new infrastructure needed)

**Audit logging for key usage**: Also fits in KV or Coralogix. Each capture already logs to Coralogix with structured fields -- adding `tenantId` to log entries gives audit trail without new infrastructure. KV-based audit logs would only be needed if you need to query audit data from the Worker itself (e.g., "show me my last 10 captures"). That's the list endpoint again, which may drive D1.

### Question 2: Scaling Beyond Session Reuse -- Threshold Analysis

The current system handles **~300 captures/min** (global rate limit) with **30 reusable browser sessions** and a 2-minute keep-alive. Here is when each scaling option becomes relevant:

**Session pre-warming via cron trigger** -- Relevant now (low effort, low risk)

This is the only scaling item I would recommend planning proactively. The backlog frames it as a scaling optimization, but its primary value is **latency reduction on low-traffic deployments**. During traffic lulls, all 30 sessions expire after KEEP_ALIVE_MS (120s). The next capture pays a cold-start penalty for `acquire()`. A cron trigger every 90 seconds that calls `sessions()` and `acquire()` to maintain a minimum warm pool (e.g., 2-3 sessions) is trivial to implement:

```toml
# wrangler.toml addition
[triggers]
crons = ["*/2 * * * *"]  # every 2 minutes
```

Implementation: ~30 lines of code in `index.js` adding a `scheduled` event handler. No new bindings, no new cost (cron triggers are free on Workers, browser sessions are billed per-use regardless of pre-warming).

This should be planned for the phase after session reuse is battle-tested with real traffic.

**Cloudflare Queues** -- Relevant at ~150-200 sustained captures/min OR when slow-page timeouts recur

The backlog correctly identifies the trigger: `ctx.waitUntil()` has a 30-second hard limit. The current capture pipeline uses ~25s for navigation timeout + 5s headroom. Queues give 15 minutes per message. Queues become necessary when:
1. Slow pages regularly hit the 25s navigation timeout (signal: `capture.stage.fail` events with `errorCategory: "Page did not finish loading"` in Coralogix)
2. Sustained throughput approaches the 200/min global limit and you need to absorb bursts without dropping requests

Queues cost: $0.40/million operations (publish + consume). At 200/min sustained, that is ~8.6M operations/month = ~$3.44/month. Negligible.

**Do not plan proactively.** The signal is in Coralogix logs. When timeout-related failures exceed an acceptable threshold (e.g., >5% of captures), Queues should move to [should].

**Durable Object session coordinator** -- Relevant only at multi-worker concurrency problems

DOs would centralize session lifecycle across Workers, preventing the race condition in `getOrCreateSession()` where two Workers both see a free session and one fails to connect. The current code handles this gracefully (catch + fallback to acquire). DOs become relevant only if:
- Session contention causes measurable capture failures (>1% of attempts)
- You need session affinity (route specific tenants to specific sessions)

Current architecture handles contention fine through random selection + fallback. **Do not plan proactively.** This is over-engineering for current scale.

**Cloudflare Containers** -- Not relevant until Browser Rendering limits are a blocking concern

Containers escape Browser Rendering's 30-session limit and gVisor sandbox constraints entirely. But they introduce: container image management, cold start latency (seconds, not milliseconds), networking complexity, and a fundamentally different deployment model. The backlog correctly notes "session reuse pushes this further out."

**Do not plan.** This is a topology escalation (per Step 0 framework) that requires a documented blocking concern. The blocking concern would be: Browser Rendering session limits are consistently exhausted AND Queues cannot absorb the overflow. That is at least two scaling thresholds away from current state.

### Question 3: CD (Deployment Automation) Timing

CD should become a priority **after per-tenant auth and before the first external user onboarding**. Here is the reasoning:

**Current state**: `wrangler deploy` is manual. For a single developer, this is fine. The CI pipeline validates code quality; deployment is a conscious human act.

**Why CD matters for multi-tenant**: When per-tenant keys exist and external users depend on the service, deployment velocity and reliability become operational requirements. A bad deploy with no automated rollback capability could leave paying/dependent users without service. The cost of manual deployment goes up (must coordinate with users, can't deploy on a schedule without friction).

**Recommended CD approach** (Cloudflare Workers-specific):

1. **Phase 1 -- Staging environment**: Add a `wrangler.toml` environment for staging (`[env.staging]`) with separate KV namespace and R2 bucket. Deploy to staging on every push to `main`. This is 15 minutes of wrangler.toml config + a workflow file.

2. **Phase 2 -- Production deploy with approval**: GitHub Actions workflow triggered by Git tags or manual `workflow_dispatch`. Uses GitHub environment protection rules (`production` environment with required reviewers). Runs smoke test against staging before deploying to production.

3. **Phase 3 -- Rollback capability**: `wrangler rollback` support (Cloudflare keeps previous deployments). Add a manual workflow_dispatch for rollback.

**Sequence recommendation**: CD Phase 1 (staging env) can be done as part of any infrastructure phase -- it is low effort and immediately useful for testing. CD Phase 2 (production with approval) should be done alongside or immediately after per-tenant auth. CD Phase 3 (rollback) should be done before onboarding external users who depend on uptime.

### Question 4: Preview Deployments on PRs

**Not worth it for the current single-developer setup.** Here is the analysis:

**Cost**: Cloudflare Workers preview deployments require either:
- `wrangler deploy --env preview-{PR_NUMBER}` with dynamically created KV namespaces, R2 buckets, and secrets -- significant wrangler.toml complexity for a disposable environment
- Cloudflare Pages (which supports preview deployments natively but is designed for static sites, not Workers)

**Benefit for single developer**: You can `wrangler dev` locally with the preview KV/R2 namespaces already configured. The feedback loop is already short.

**When it becomes worth it**:
- Second developer (code review with live preview)
- External contributors (can't run `wrangler dev` without secrets access)
- Integration testing that requires the Cloudflare runtime (Browser Rendering binding is not available in local dev)

**Recommendation**: Keep at [consider]. Revisit when team size > 1.

---

## Proposed Tasks

### Task 1: KV Key Schema for Per-Tenant Auth (Infrastructure Enablement)

**What**: Design and document the KV key schema that per-tenant auth will use. This is infrastructure prep that security-minion's auth implementation depends on.

**Deliverables**:
- KV key schema document: key naming convention (`apikey:<sha256>`, `tenant:<tenantId>`), value shapes, TTL strategy
- Migration path from single `CAPTURE_API_KEY` env secret to KV-based key lookup
- Backward compatibility plan (support both old and new auth during migration)

**Dependencies**: None. This is a design task that unblocks security-minion's per-tenant auth implementation.

### Task 2: Staging Environment Configuration

**What**: Add a staging environment to `wrangler.toml` with isolated KV and R2 bindings.

**Deliverables**:
- `wrangler.toml` `[env.staging]` section with separate KV namespace and R2 bucket
- GitHub Actions workflow (`deploy-staging.yml`) that deploys to staging on push to `main`
- Smoke test script that hits `/health` and a basic capture flow against staging

**Dependencies**: None. Can be done in any phase.

### Task 3: Session Pre-Warming Cron Trigger

**What**: Add a cron trigger that maintains a minimum warm session pool during low-traffic periods.

**Deliverables**:
- `[triggers]` section in `wrangler.toml` with cron schedule
- `scheduled` event handler in `index.js` that checks `sessions()` and `acquire()`s if below minimum
- Coralogix log entry for pre-warming events (for capacity monitoring)

**Dependencies**: Requires observability data showing cold-start latency impact. Can be implemented speculatively (low risk, low cost) or data-driven after monitoring shows the pattern.

### Task 4: Production CD Pipeline with Environment Protection

**What**: Automated deployment to production triggered by Git tags, with GitHub environment protection.

**Deliverables**:
- GitHub Actions workflow (`deploy-production.yml`) with `workflow_dispatch` and tag triggers
- GitHub `production` environment with required reviewers
- `CLOUDFLARE_API_TOKEN` secret scoped to `production` environment
- Post-deploy health check step
- Rollback documentation (manual `wrangler rollback` procedure)

**Dependencies**: Task 2 (staging environment should exist first so the deploy pipeline can run smoke tests against staging before promoting to production).

### Task 5: Queues Migration (Triggered by Data, Not Calendar)

**What**: Replace `ctx.waitUntil()` capture processing with Cloudflare Queue consumer.

**Deliverables**:
- Queue binding in `wrangler.toml`
- Producer: `handleCreateCapture` publishes to queue instead of `ctx.waitUntil()`
- Consumer: Queue handler calls `performCapture()`
- Retry policy configuration (dead-letter after N failures)
- Updated rate limiting strategy (queue depth as backpressure signal)

**Dependencies**: This task is data-driven. It should move from [consider] to [should] when Coralogix data shows either: (a) timeout-related capture failures >5% of attempts, or (b) traffic regularly approaches 200/min sustained. **Not calendar-scheduled.**

---

## Risks and Concerns

### Risk 1: KV Eventual Consistency Window During Key Rotation

When per-tenant auth moves to KV, key rotation creates a window where a newly-rotated key may not be visible at all edge locations. KV's propagation is typically <60 seconds but can be longer under load. Mitigation: the backlog already requires "API key rotation without downtime -- support multiple active keys." This means old keys remain valid during propagation. The auth implementation must check both old and new keys during rotation.

### Risk 2: Browser Rendering Billing Opacity

Cloudflare Browser Rendering pricing has changed multiple times. Session reuse reduces costs significantly, but there is no cost-per-capture visibility in the current setup. Before scaling beyond current traffic, instrument Coralogix logs with session lifecycle data (acquire vs. reuse, session age, session count at time of capture) to build a cost model. Without this, scaling decisions are blind.

### Risk 3: Single-Region State Concentration

KV and R2 are globally distributed, but the `wrangler secret` values (CAPTURE_API_KEY, CORALOGIX_SEND_KEY, SIGNING_KEY) are managed through a single Cloudflare account with no infrastructure-as-code backing. Loss of account access or accidental secret deletion has no recovery path beyond re-creating secrets manually. Mitigation: document all secrets and their rotation procedures. Consider `wrangler.toml` secret references with values stored in a secrets manager (Cloudflare has no native secrets manager, so this would be external -- but even a documented list in a secure location is better than nothing).

### Risk 4: No Terraform / IaC for Cloudflare Resources

KV namespaces, R2 buckets, rate limiters, and DNS records are managed manually or via `wrangler.toml` declarative config. `wrangler.toml` is a form of IaC, but it lacks: state tracking, drift detection, plan/apply workflow, and multi-resource orchestration. For a single-developer project, this is acceptable. For multi-tenant production, consider Cloudflare Terraform provider for resources that `wrangler.toml` does not manage (DNS records, WAF rules, custom domains, account-level settings). This is not urgent but should be on the radar when operational complexity grows.

### Risk 5: ctx.waitUntil() Budget Fragility

The 30-second `ctx.waitUntil()` budget is the single most constraining infrastructure limit. Navigation timeout (25s) + R2 writes + KV updates + WACZ bundling + Coralogix logging must all complete within 30s. WACZ bundling involves cryptographic signing and ZIP creation in-memory. If page complexity increases (larger screenshots, more artifacts), this budget will be the first thing to break. The Queues migration (Task 5) is the escape valve, but until then, monitoring `capture.success` durations in Coralogix is critical for early warning.

---

## Additional Agents Needed

**observability-minion**: The scaling threshold decisions (Questions 2 and 3) depend on having actionable Coralogix dashboards and alerts. The backlog lists `[consider] Coralogix alerting rules` -- this should be elevated. Specifically, the following signals need dashboards before scaling decisions can be data-driven:
- Capture duration distribution (P50, P95, P99)
- Timeout failure rate as percentage of total captures
- Session pool utilization (free sessions vs. total sessions at time of capture)
- Global rate limiter hit rate
- Browser Rendering cost proxy metrics (acquires vs. reuses per hour)

Without these dashboards, scaling decisions are guesswork. The observability-minion should define the monitoring requirements that make Task 5 (Queues migration) trigger-able by data rather than by calendar or gut feel.
