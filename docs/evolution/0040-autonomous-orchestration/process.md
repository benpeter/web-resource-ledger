# Process: Autonomous Orchestration Framework

## TL;DR

A single interactive session designed the complete SaaS completion plan
for WRL: 28 nefario phases across Acts 3-6, an autonomous shell
orchestrator, and the full product/business strategy (billing, legal,
bookkeeping). The session used 3 Explore agents for initial research,
2 Plan agents for roadmap and framework design, and 3 research agents
for D1 alternatives, billing options, and German legal requirements.
No nefario orchestration was used -- this was a direct human-AI
collaboration session with iterative refinement.

## How the session worked

### Phase 1: Codebase exploration (3 parallel agents)

Three Explore agents ran simultaneously:
1. **Evolution log agent**: Read all 38 evolution phases, understood the
   nefario process, mapped the development trajectory
2. **GitHub issues agent**: Catalogued all 48 issues (4 open, 44 closed),
   understood the R-numbering system and backlog structure
3. **Product state agent**: Assessed current capabilities, architecture,
   and gap to SaaS readiness

### Phase 2: Plan design (2 parallel agents)

1. **Product roadmap agent**: Designed 25 items (R15-R39) across Acts 3-6
   with dependency graph and build sequence
2. **Execution framework agent**: Designed the orchestrator architecture,
   session prompt template, verification logic, and error recovery

### Phase 3: Iterative refinement with human

This was the longest phase -- ~10 rounds of feedback that reshaped the
plan significantly:

1. **Lucy at gates** (not auto-approve): Human corrected the assumption
   that gates should be blindly auto-approved. Lucy reviews each gate
   decision, providing convention auditing.

2. **D1 migration moved forward**: Human pointed out that migration
   cost grows with each KV-based feature. No users = cheap migration now.

3. **R16 included**: Human overrode the data-driven trigger ("test load
   won't produce timeouts, just build it now").

4. **Margo scoping**: Human asked whether Margo needs to be "put in a box"
   to prevent blocking planned features. Added scope constraint to
   session prompt.

5. **Brand identity phase added**: Human asked about brand/styling
   strategy. Added dedicated phase before Web UI.

6. **npm publish clarified**: Human noted @w-r-l/verify is already on npm.
   R20 changed from "initial publish" to "CI automation for updates".

7. **Billing discussion (Stripe vs LemonSqueezy)**: Started with
   LemonSqueezy (simpler, MoR). Human pushed back on fixed tiers --
   wants usage-based with multiple meters. Research agent compared both.
   Switched to Stripe.

8. **Invoicing/legal deep dive**: Human asked about full legal implications.
   Research agent investigated Gewerbeanmeldung, VAT, EÜR, OSS, Stripe Tax.
   Realistic hour estimates provided (5-10h/month without automation).

9. **SevDesk integration**: Human asked about automating bookkeeping.
   Added as Phase 0061 (Stripe webhooks -> SevDesk API).

10. **Gewerbeanmeldung deferred**: Human argued that retroactive registration
    makes the whole test-mode/live-mode distinction unnecessary. Research
    confirmed: legally safe within months, practically risk-free for small
    amounts. Simplified the plan significantly.

11. **Notification system**: Tested iMessage (failed: sends to self),
    AWS SNS (worked but complex), ntfy.sh (worked, simple, free).

12. **Domain**: webresourceledger.com already registered and on Cloudflare.
    DNS records will be created by nefario sessions.

13. **Supervisor session**: Human asked if orchestrator should run from
    within a Claude session. Yes -- fresh session with supervisor-prompt.md.

14. **Escalation**: Human asked for ntfy notification when supervisor
    hits unfixable errors. Added to supervisor-prompt.md.

### Phase 4: Implementation

Built directly (no nefario, no specialists -- this was infrastructure):
- Orchestrator scripts (orchestrate.sh + 7 supporting files)
- 24 issue spec files (written by 3 parallel agents)
- 28 GitHub issues created via create-issues.sh
- Evolution log, product management structure
- Repo made private

## What the human decided

- **Stripe over LemonSqueezy**: Full pricing flexibility over legal simplicity
- **Defer Gewerbeanmeldung**: Build and launch first, register when revenue appears
- **D1 early**: Pay migration cost once while codebase is small
- **R16 included**: Don't wait for data-driven trigger
- **Lucy at gates**: Active review, not rubber-stamp approval
- **Single private repo**: Don't split commercial/open-source yet
- **ntfy.sh for notifications**: After testing iMessage and AWS SNS
- **webresourceledger.com**: Domain already registered and on Cloudflare

## What the human chose NOT to intervene on

- The 28-phase roadmap items and their sequencing
- Budget estimates per phase ($30-$120)
- The session prompt template (Lucy protocol, Margo scoping)
- The orchestrator architecture (shell script, not something fancier)
- D1 as database choice (over Turso, Supabase, Neon)

## Where to read more

- Plan file: `scripts/autonomous/manifest.json`
- Session prompt: `scripts/autonomous/session-prompt.md`
- Supervisor prompt: `scripts/autonomous/supervisor-prompt.md`
- Issue specs: `scripts/autonomous/issue-specs/`
