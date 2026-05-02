# Phase 0: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 0-foundation
**Areas discussed:** URL battery sourcing, "Before" corpus storage, Coralogix baseline window, Plan partition

---

## Gray-area selection (initial)

Operator was offered four areas to discuss; selected three (one of the three turned out to be a clarification request, not a discussion area):

| Option | Description | Selected |
|---|---|---|
| URL battery sourcing | Compose ≥20 URLs covering 6 categories | ✓ |
| "Before" corpus storage | In-repo vs R2-key references vs hybrid | ✓ |
| Coralogix baseline window | 7d / 30d / since-deploy / both | (not initially, asked later) |
| Plan partition | 2 plans vs 3 vs mega-plan | (not initially, asked later) |
| (write-in) "what does CDP stand for here" | Clarification request | n/a (answered inline) |

**CDP clarification:** Chrome DevTools Protocol — the binary control protocol Playwright wraps. AUDIT-04's spike checks whether `@cloudflare/playwright` exposes `page.context().newCDPSession(page)` and `Network.getResponseBody`, gating Phase 7's subresource-capture approach.

---

## URL Battery Sourcing

### Composition

| Option | Description | Selected |
|---|---|---|
| Hybrid: mine prod + curate gaps (Recommended) | Top-N from logs + hand-fill missing categories | |
| Production mining only | Top-50 from prod, accept the distribution | |
| Hand-curated only | Build from known stress sites | ✓ (with Claude proposing the list) |
| Use vault notes as starting point | Check `~/vault/Projects/Web Resource Ledger/` | |

**User's choice:** Hand-curated, Claude proposes the list. Research what would make sense; produce a set of sites that may be troublesome but that are **not similar** — broad coverage of different CMPs, paywall types, etc.

**Notes:** Diversity is failure-orthogonal — five news sites is fine if they each fail differently. Two news sites that fail the same way is not.

### Stability

| Option | Description | Selected |
|---|---|---|
| Frozen for the milestone (Recommended) | One battery, no swaps | ✓ |
| Frozen core + extension slots | Core 20 + per-phase additions | |
| Refreshable each phase | Living list, may swap URLs | |

**User's choice:** Frozen for the milestone.

### Wall content (paywalls / login walls)

| Option | Description | Selected |
|---|---|---|
| Public-side only of paywalled sites (Recommended) | Anonymous capture of article URL | ✓ |
| Skip walled content entirely | Only public URLs, no walls at all | |
| Authenticated captures via test accounts | Logged-in captures for select sites | |

**User's choice:** Public-side only — but **must** include the consent-or-pay (PUR) hybrid pattern (e.g., spiegel.de) where there's both a CMP layer and a paywall, and the autoconsent path through the consent layer must still function.

**Notes:** Likely DACH publishers in the battery: spiegel.de, zeit.de, faz.net, sueddeutsche.de. Pick one or two diverse representatives, not all four.

---

## "Before" Corpus Storage

### Storage location

| Option | Description | Selected |
|---|---|---|
| R2 references only (Recommended) | capture_id + R2 keys in `url-battery.md`, future phases re-fetch | ✓ |
| In-repo full corpus | `.planning/audit/before/{capture_id}/` committed to git | |
| Hybrid: screenshots in repo, WACZ in R2 | Screenshots committed, WACZ stays in R2 | |

**User's choice:** R2 references only. Relies on WRL's "never delete captures" retention guarantee, which is a product-level invariant.

### Source environment

| Option | Description | Selected |
|---|---|---|
| Production (Recommended) | `api.webresourceledger.com` against operator's tenant | ✓ |
| Staging | `staging.webresourceledger.com`, separates from real customer traffic | |
| Both, before each phase | Re-capture in each env every phase | |

**User's choice:** Production. Volume is trivial; reflects real production code paths and signing.

### Re-capture cadence

| Option | Description | Selected |
|---|---|---|
| End-of-milestone only (Recommended) | One "before", one "after" at milestone end | ✓ |
| Each phase re-captures its area | Per-phase area-specific re-capture | |
| No formal re-capture | Each phase handles its own A/B | |

**User's choice:** End-of-milestone only. Headline before/after delta is computed once.

---

## Coralogix Baseline Window

| Option | Description | Selected |
|---|---|---|
| Last 30 days, aggregated (Recommended) | Smoothed view, statistical floor | ✓ |
| Last 7 days, aggregated | Tighter "current" reflection | |
| Since last production deploy | Most precise "current code" | |
| 30d AND 7d, side-by-side | Both reported in `AUDIT.md` | |

**User's choice:** 30 days, aggregated. Per-tenant breakout deliberately not required — aggregate is sufficient for system-wide fidelity work.

---

## Plan Partition

| Option | Description | Selected |
|---|---|---|
| Two plans: pre-flight + audit (Recommended) | Roadmap-default split | ✓ |
| Three plans: pre-flight + audit + spike | CDP spike as its own plan | |
| One mega-plan | Single dependency chain | |

**User's choice:** Two plans, matching the roadmap estimate. Pre-flight (PRE-01/02/03) ships first, deploys, then audit baselines run against the cleaned-up system.

---

## Claude's Discretion

The operator did not pre-select these but they are noted in CONTEXT.md `<decisions> § Claude's Discretion` for the planner:

- **CDP spike form factor (AUDIT-04):** persistent test file at `test/audit/cdp-availability.test.js` (or similar) rather than a one-shot script — re-validates on future Playwright upgrades.
- **`AUDIT.md` structure:** four sections — baselines table, failure-mode prioritization, CDP spike result, embedded Coralogix queries.
- **`@cloudflare/playwright` `^1.1.2 → ^1.3.0` upgrade:** deferred to Phase 1 (Pipeline Harness) to keep Plan A pure bug fixes.
- **PRE-03 disambiguation:** prefer renaming `ui-submit.js`'s `formatDate` callsite per typical WRL UI structure, but planner should grep before deciding.
- **PRE deploy gate:** `scripts/smoke-test.sh` against staging + visual confirmation of the billing-grace-period banner, before promoting to production.

---

## Deferred Ideas

- `@cloudflare/playwright` upgrade `^1.1.2 → ^1.3.0` — Phase 1.
- Authenticated captures via test accounts — out of scope, possibly never.
- Per-tenant baseline breakout — out of scope; queries are documented for ad-hoc re-runs.
- URL-battery refresh during the milestone — explicitly rejected (preserves A/B comparability).
- Capture-tagging for the audit batch — only if the existing capture API supports a free-form tag; otherwise no-op.
