# Decisions: Autonomous Orchestration Framework

## Stripe over LemonSqueezy

- **LemonSqueezy** proposed first as Merchant of Record (handles VAT/tax).
  Simpler legally, 5% + €0.50/tx.
- **Switched to Stripe** after discussing pricing model. WRL needs
  multi-meter usage-based billing (Captures, Storage, API Calls as
  separate meters with tiered pricing). LemonSqueezy's usage-based
  support is too basic for this.
- Stripe Tax handles VAT calculation. Filing is manual (~2h/quarter)
  or via partner (€50-200/month).

## Gewerbeanmeldung deferred

- Originally planned as Phase 0 blocker.
- Research showed retroactive registration is legal (up to 60 months),
  practically risk-free within months, max fine €1,000 (usually €0-100).
- Decision: build with live Stripe keys, register when revenue > €1K.
- Eliminates the test-mode/live-mode distinction entirely.

## D1 migration pulled forward

- Originally planned for Act 5 (after features accumulated on KV).
- User pointed out: no users exist, so migration is cheap now and
  grows more expensive with every KV-based feature added.
- Zero-downtime dual-write unnecessary -- clean migration.
- Moved to Phase 0047 (Act 3), before Web UI.

## R16 Queue migration included (not conditional)

- Backlog had it as "data-driven: when timeouts >5%".
- User noted test load won't trigger the condition, but queues are
  architecturally correct and simpler to add now.
- Included in manifest as Phase 0044.

## Lucy at gates (not auto-approve)

- Initial design: auto-approve all gates in nefario workflow.
- User corrected: Lucy should review and decide at each gate,
  providing the same judgment a human convention auditor would.
- This catches drift, scope creep, and convention violations.

## Margo scoped to implementation

- Risk: Margo's simplicity enforcement could block planned features
  ("YAGNI" on features the product owner explicitly approved).
- Solution: session prompt constrains Margo to implementation
  simplicity within each feature, not questioning feature existence.

## Pacing: ntfy + 30min + act boundary waits

- Tried iMessage first -- sent from user to self (read immediately).
- Tried AWS SNS, TextBelt -- SNS worked but ntfy.sh simpler.
- ntfy.sh: free, push notifications, no account needed.
- 30 min pause between phases, user GO signal between acts.

## Database: D1 over alternatives

- **D1**: native Worker binding, zero HTTP overhead, SQLite, same ecosystem
- **Turso**: good but adds HTTP hop + npm dependency
- **Supabase**: auto-pauses on free tier, latency tax, philosophy mismatch
- **Neon**: limited free tier, compute scales to zero
- Decision: D1. Turso as fallback if D1 hits limits.

## Repo: private, single repo

- Considered: separate repo for commercial features
- Decision: one private repo during development. Open-source
  extraction of core capture/verify engine is a post-launch phase.

## SevDesk integration for bookkeeping

- Stripe webhooks -> Worker -> SevDesk API
- Automates invoice creation, expense booking, USt-VA data
- Reduces bookkeeping from 5-10h/month to 2-3h/month
- Built against sandbox, activated at go-live

## Supervisor session architecture

- Orchestrator runs from a Claude Code supervisor session
- Supervisor monitors, reacts to failures, escalates via ntfy
- Fresh session (not the planning session) for clean context
