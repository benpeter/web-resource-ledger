> **This is the original product vision document.** It describes the full
> scope of what WRL could become. For what has actually been built, see the
> [README](README.md). For current priorities, see
> [docs/backlog.md](docs/backlog.md). For how each feature was implemented,
> see [docs/evolution/](docs/evolution/).

# Web Resource Ledger (WRL)

**One-liner:** Tamper-evident archival of web resources with proof of state at a point in time.

**Problem:** Organizations need verifiable proof of what was published online and when — for compliance, legal, regulatory, or contractual reasons.

**Core capability:** Capture, store, and retrieve immutable snapshots of web resources with cryptographic proof of capture time and content integrity.

---

## Capture definition
- A capture is an immutable bundle containing: rendered screenshot, HTML snapshot, HTTP response headers, resource manifest (CSS/JS/images)
- Bundle format TBD — needs to be self-contained and verifiable

## Trigger methods
- Scheduled captures (cron-style)
- Webhooks (event-driven)
- API (on-demand)
- MCP (AI-agent-driven)

## Bulk / monitoring mode
- Watch lists: sets of URLs captured on a recurring schedule
- The sticky use case — single URL capture is table stakes

## Change detection
- Diff between captures of the same resource over time
- Surface when and what changed

## Verification & retrieval
- Public verification endpoint — third parties can independently confirm capture authenticity
- Shareable proof links (no account required to verify)
- This is the core value prop: proof that others can check

## Storage
- Cloud-native, immutable blob storage for captures
- Separate stores for: runtime data, tenant/account config, capture artifacts
- Signing/hashing for auditability chain

## API-first
- OpenAPI spec as the single source of truth
- All interfaces (webhooks, MCP, web UI) built on top of the API

## Notifications
- Capture success/failure
- Quota warnings
- Change alerts (ties into change detection)
- Outbound webhooks, email — separate concern from inbound trigger webhooks

## Multi-tenancy
- Tenant isolation
- Per-tenant user management with RBAC
- Social signup (GitHub first)

## Billing & quotas
- Metering model: captures per month, storage consumed, retention duration
- Per-tenant quotas and limits
- Usage tracking for billing

## Legal admissibility
- Target jurisdictions/standards shape the signing approach
- Candidates: eIDAS (EU), FRCP (US)
- Determines whether a trusted timestamping authority is needed

## Operations
- Autoscaling
- Latency target: <300ms for uncached operations

---

## Open questions
1. Signing — full cryptographic chain (timestamping authority, content hash) or lighter approach? Depends on legal admissibility targets.
2. Retention policies — immutable forever, or tenant-configurable TTL?
4. Bundle format — WARC, MHTML, custom, or something else?
5. Which jurisdictions/standards to target first for legal admissibility?
