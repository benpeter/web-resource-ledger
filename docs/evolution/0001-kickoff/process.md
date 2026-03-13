# 0001: How the MVP Scope Was Built

TL;DR: Six specialist agents debated the WRL MVP scope across three phases
of planning, one architecture review, and two approval gates. The human
intervened twice at gates (OpenAPI in, versioned URLs). Four conflicts were
resolved by synthesis. The result: 8 decisions, 8 implementation issues, and
a scope document small enough to fit the core value prop without building a
miniature version of the full product.

---

## The Setup

The kickoff prompt asked for one thing: "the smallest thing that delivers the
core value prop: capture a URL, store it immutably, and let a third party
verify the capture." PRODUCT.md describes a full-featured SaaS platform --
multi-tenancy, scheduled captures, change detection, notifications, billing.
The job was to figure out which parts of that vision are load-bearing for the
first shippable version, and which are future work wearing an "essential" disguise.

The prompt named three agents explicitly (gru, lucy, margo) and invoked
nefario as the orchestrator. Nefario's first job was to decide who else
should be at the table.

## Phase 1: Assembling the Team

Nefario analyzed the task and selected six specialists for planning:

- **gru** -- technology landscape: what exists, what to build, what to adopt
- **lucy** -- intent alignment: does the plan match what the human actually asked for
- **margo** -- YAGNI enforcement: cut everything that isn't essential
- **api-design-minion** -- the API surface IS the product for an API-first MVP
- **iac-minion** -- headless browser constrains where you can deploy and what it costs
- **security-minion** -- rendering arbitrary URLs in a headless browser is dangerous enough that security controls are scope-defining

Twenty-one other agents were considered and excluded. Most exclusions were
obvious (no UI means no frontend-minion, no database means no data-minion),
but a few were deliberate deferrals: test-minion was held for architecture
review rather than planning, and api-spec-minion was skipped because margo
was expected to recommend deferring formal specs anyway.

The team was approved without changes.

Full meta-plan: [`phase1-metaplan.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase1-metaplan.md)

## Phase 2: The Specialist Discussions

All six specialists worked in parallel. Each received the same task context
but a different planning question targeting their domain expertise.

### What gru found

Gru assessed four technology dimensions: bundle formats, signing approaches,
capture engines, and storage backends.

The key recommendation was WACZ (Web Archive Collection Zipped) -- a ZIP
container with WARC records and a SHA-256 manifest. The argument: WACZ has
legal pedigree (Harvard LIL, Library of Congress, Starling Lab), built-in
integrity verification, and "makes all other decisions reversible" because the
format accommodates upgrades without changing the container. The MVP uses a
simplified WACZ -- HTML, screenshot, and headers packaged with warcio.js --
not the full forensic-grade capture.

For signing, gru recommended RFC 3161 via FreeTSA as part of MVP. This turned
out to be one of the four conflicts resolved in synthesis.

Gru also identified Cloudflare Browser Rendering as the capture engine --
managed headless Chrome, Puppeteer API, no infrastructure to self-manage.
This aligned with the Cloudflare/Fastly technology preference and the
zero-ops constraint.

Full analysis: [`phase2-gru.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-gru.md)

### What lucy found

Lucy decomposed the kickoff prompt into three requirements (R1: capture, R2:
store immutably, R3: third-party verification) plus eight constraints
extracted from CLAUDE.md and the project configuration. Every PRODUCT.md
feature was then classified as clearly in, clearly out, or gray zone against
those requirements.

The most useful contribution was identifying a real tension: CLAUDE.md says
"more code, less blah blah" (ship, don't debate), but also mandates evolution
log documentation for every phase. Lucy's resolution: these aren't
contradictory if scoped correctly. "More code, less blah blah" targets
planning paralysis; the evolution log targets retrospective transparency. Keep
entries terse -- if decisions.md exceeds one page, something went wrong.

Lucy also flagged five risks, including the one that materialized: "API-first
as blocking constraint" -- if OpenAPI is interpreted as write-the-full-spec-
before-any-code, it creates a documentation bottleneck. The original plan
deferred OpenAPI. The human overruled this at Gate 1 (see below).

Full analysis: [`phase2-lucy.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-lucy.md)

### What margo found

Margo's YAGNI audit was the most aggressive scope-cutter. The structure: take
each PRODUCT.md feature, ask "does the MVP user story require this to deliver
the core value prop?", and give a clear in/out recommendation.

Key outcomes:
- **Multi-tenancy, auth, users**: OUT. Zero users exist. Static API key
  suffices.
- **Web UI**: OUT (except verification page -- gray zone).
- **Scheduled captures / watch lists**: OUT. On-demand is table stakes;
  scheduling is an entire subsystem.
- **Database**: OUT. "This is the highest-leverage simplification in the
  entire audit." Write-once, read-by-ID access pattern. Blob storage is
  sufficient.
- **OpenAPI spec**: OUT. "Spec after the API surface stabilizes." (The human
  disagreed -- see Gate 1.)

Margo quantified the scope reduction: the stripped MVP scores 12 on a
complexity budget, versus ~47 with all the features. A 4x complexity
reduction for the same core value prop.

Full analysis: [`phase2-margo.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-margo.md)

### What the API design found

Api-design-minion proposed four endpoints:

```
POST /captures         -- submit URL, get 202 + capture ID
GET  /captures/{id}/status -- poll progress
GET  /captures/{id}    -- retrieve capture metadata + artifact links
GET  /verify/{id}      -- public verification (no auth)
```

The async pattern was the main design decision: page rendering takes 5-30
seconds, so capture must be async. The simplest pattern is submit-then-poll
(no SSE, no webhooks, no WebSockets). The verification endpoint was separated
from the captures namespace because it has a different auth boundary (fully
public vs. API-key-gated).

Full analysis: [`phase2-api-design-minion.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-api-design-minion.md)

### What iac-minion found

Iac-minion evaluated the deployment landscape and recommended a fully
Cloudflare-native stack: single Worker for all API routes, Browser Rendering
for headless capture, R2 for storage, KV for metadata. Estimated cost:
~$5/month. One deployment command (`wrangler deploy`). No containers, no
certificates, no scaling configuration.

The key insight: Cloudflare Browser Rendering eliminates the traditional
headless-browser ops burden. It's managed Chrome accessed via Puppeteer API,
isolated per-request, with no cold-start container management.

Full analysis: [`phase2-iac-minion.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-iac-minion.md)

### What security-minion found

Security-minion ran a STRIDE threat model against the MVP. Twelve threats
analyzed; SSRF through user-supplied URLs was flagged as T1 critical (highest
severity, must-address-in-MVP).

The SSRF prevention strategy: URL scheme allowlist (http/https only), DNS
pre-resolution with private IP blocking (both IPv4 and IPv6), DNS pinning to
prevent TOCTOU attacks (where DNS resolves to a safe IP during validation but
a different IP during browser fetch), and redirect chain re-validation.

For signing, security-minion recommended Ed25519 over SHA-256 with an
extensible signatures array. This was simpler than gru's RFC 3161
recommendation and became the winning approach in synthesis.

Full analysis: [`phase2-security-minion.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase2-security-minion.md)

## Phase 3: Resolving the Conflicts

Nefario synthesized six specialist contributions into a single execution
plan. Four conflicts needed resolution:

### Conflict 1: Bundle Format -- WACZ vs. Directory-of-Files

**gru** said WACZ. **margo** said directory-of-files (simpler, fewer
dependencies).

**Resolution: WACZ.** The complexity delta is smaller than it appears. WACZ
*is* a directory of files inside a ZIP with a `datapackage.json` manifest.
The manifest IS the verification mechanism -- you don't build one from
scratch. The legal pedigree is free value. And gru's argument that "WACZ
makes all other decisions reversible" was decisive: the format accommodates
signing upgrades, fuller captures, and format evolution without changing the
container.

### Conflict 2: Auth -- API Key vs. No Auth

**margo** said no auth for MVP. **security-minion** said API key for the
capture endpoint.

**Resolution: Static API key.** This is not "auth" in the user-management
sense -- it's a single bearer token stored as an environment variable. One
`if` statement. The capture endpoint launches a headless browser that can make
arbitrary network requests (SSRF). Without a kill switch, rate limiting alone
is insufficient because attackers rotate IPs. Margo's own contribution
acknowledged "at most a static API key." Verification stays fully public.

### Conflict 3: Signing -- Ed25519 vs. RFC 3161

**gru** recommended RFC 3161 via FreeTSA in MVP. **security-minion**
recommended Ed25519 self-signing. **lucy** said defer TSA.

**Resolution: Ed25519 for MVP, RFC 3161 deferred.** Ed25519 proves integrity
and WRL authorship. The signatures array in the manifest accommodates future
TSA timestamps without format changes. RFC 3161 adds temporal proof from a
trusted third party but requires ASN.1 parsing and an external service
dependency -- too much for MVP. The upgrade path is designed: add a
`signatures` array entry, no format change needed.

### Conflict 4: Screenshots -- In vs. Deferred

**lucy** advised deferring screenshots (heavy headless browser dependency).
**gru** and **iac-minion** assumed the browser was already in the
architecture.

**Resolution: Screenshots are in.** The headless browser is already there for
HTML rendering via Cloudflare Browser Rendering. Once the browser is open,
a screenshot is one additional API call -- essentially free. The real
complexity escalation would be resource manifests (CSS/JS/images captured
individually), which were kept out.

Full synthesis: [`phase3-synthesis.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/phase3-synthesis.md)

## Phase 3.5: Architecture Review

Before the plan reached the human, five mandatory reviewers audited it:

- **security-minion**: ADVISE -- flagged IPv6 gaps in SSRF prevention,
  DNS TOCTOU pinning, Ed25519 key format specification, capture ID entropy
- **test-minion**: ADVISE -- recommended Vitest over Jest, specific SSRF test
  vectors, signing round-trip tests, end-to-end integration test
- **ux-strategy-minion**: ADVISE -- flagged that capture ID recovery is
  impossible if lost (no listing endpoint), and that progressive enhancement
  is impossible without SSR (use graceful degradation instead)
- **lucy**: ADVISE -- pin implementation plan location, guard prompt.md from
  modification, remove pre-scripted surprises from agent prompts
- **margo**: ADVISE -- Task 2 (technology decisions) was redundant with
  decisions already documented in Task 1, Issue #8 should be decomposed,
  use platform rate limiting instead of custom implementation

Zero BLOCKs. Fifteen advisory notes total. All were incorporated into the
execution plan's task prompts before presenting to the human.

Review verdicts: [`phase3.5-*.md`](../../../docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/)

## The Human Interventions

### Gate 1: MVP Scope Document

The first approval gate presented the completed `docs/MVP.md` for review.
The human approved with two changes:

1. **OpenAPI moved from OUT to IN.** The original plan (backed by both margo
   and lucy) deferred the OpenAPI spec until the API surface stabilized.
   The human disagreed: with only 4 endpoints, the maintenance cost is low,
   and an OpenAPI spec serves as executable documentation from day one. The
   plan was updated -- OpenAPI became Decision #8, and the API surface section
   was revised to note `openapi.yaml` as the source of truth.

2. **Versioned API URLs.** The original endpoints had no version prefix. The
   human requested `/v1/` on all endpoints to allow non-breaking API
   evolution. This was applied to all four endpoints: `/v1/captures`,
   `/v1/captures/{id}/status`, `/v1/captures/{id}`, `/v1/verify/{id}`.

Both changes were applied directly to `docs/MVP.md`. The gate was
re-presented and approved.

### Gate 2: Technology Decisions

The `decisions.md` document was approved as-is. Eight decisions in terse
what/why/rejected format. No changes requested.

### What the human did NOT intervene on

One concern was deliberately held back: the screenshot may be taken too early,
before the page finishes loading. Cloudflare Browser Rendering launches a
headless browser, but web pages with dynamic content, lazy loading, or
client-side rendering may not be fully rendered when the screenshot fires.

The human chose not to raise this at the planning gates. The intent was to
see whether the agent team would catch the issue during implementation --
specifically whether the security-minion, test-minion, or implementing agent
would add wait-for-load logic (e.g., `waitUntil: 'networkidle'`, explicit
element visibility checks, or similar). This is a deliberate test of the
system's ability to identify and address edge cases without human prompting.

If the implementation ships without addressing screenshot timing, that's a
data point about the limits of the current setup.

## The Execution

Five tasks ran sequentially:

| # | Task | Agent | Deliverable |
|---|------|-------|-------------|
| 1 | MVP Scope Document | software-docs-minion | `docs/MVP.md` |
| 2 | Technology Decisions | software-docs-minion | `docs/evolution/0001-kickoff/decisions.md` |
| 3 | Implementation Plan | software-docs-minion | Appended to `docs/MVP.md` |
| 4 | GitHub Issues | devx-minion | Issues #1-#8 with `mvp` label |
| 5 | Evolution Log Outcome | software-docs-minion | `docs/evolution/0001-kickoff/outcome.md` |

Tasks 1 and 2 had approval gates. Tasks 3-5 ran without gates (lower blast
radius, easily revised).

All output was documentation -- no code, no tests, no deployment. Post-
execution phases (code review, tests, docs) were correctly skipped by
existing conditionals.

## What Was Decided

Eight architectural decisions, documented in
[`decisions.md`](decisions.md):

1. **WACZ** as the bundle format (over directory-of-files, MHTML, custom JSON)
2. **Ed25519 self-signing** with extensible signatures array (over RFC 3161, HMAC, blockchain)
3. **Cloudflare-native serverless** -- Worker + Browser Rendering + R2 + KV (over self-hosted, AWS)
4. **R2 content-addressed storage** -- object key = SHA-256 hash (over S3, database)
5. **Static API key** for capture only (over no auth, OAuth)
6. **4 versioned endpoints** with async polling (over sync, SSE, webhooks)
7. **HTML + screenshot + headers** as capture scope (over resource manifest)
8. **OpenAPI spec in scope** from day one (human override of the original deferral)

## Where to Read the Full Discussions

All specialist contributions, synthesis documents, reviewer verdicts, and
agent prompts are preserved in the companion directory:

```
docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning/
```

Key files for understanding how conclusions were reached:

| File | What it contains |
|------|-----------------|
| `phase1-metaplan.md` | Who was consulted and why; who was excluded and why |
| `phase2-gru.md` | Technology landscape assessment with adopt/trial/hold ratings |
| `phase2-lucy.md` | Feature classification against R1/R2/R3, tension identification |
| `phase2-margo.md` | YAGNI audit with complexity budget (12 vs 47 points) |
| `phase2-security-minion.md` | STRIDE threat model, 12 threats, SSRF as T1 critical |
| `phase2-api-design-minion.md` | API surface design, async pattern rationale |
| `phase2-iac-minion.md` | Infrastructure options, cost analysis |
| `phase3-synthesis.md` | Full delegation plan with conflict resolutions |
| `phase3.5-*.md` | Architecture review verdicts (15 advisory notes) |

The nefario execution report is at:
[`docs/history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning.md`](../../history/nefario-reports/2026-03-13-105026-wrl-mvp-scoping-and-planning.md)
