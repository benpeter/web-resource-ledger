# Meta-Plan: NAV_TIMEOUT_MS Staged Fallback Strategy Advisory

**Mode**: META-PLAN (Advisory)
**Task**: Investigate the 25s NAV_TIMEOUT_MS constraint and evaluate a staged
fallback strategy for heavy pages that timeout.

## Context Summary

The capture pipeline in `src/capture.js` uses Playwright's `page.goto()` with
`waitUntil: 'networkidle'` and a 25s timeout (`NAV_TIMEOUT_MS = 25000`). This
sits inside a `ctx.waitUntil()` call in `src/index.js:132` with a 30s
wall-clock budget on Cloudflare Workers paid plan. Heavy sites like
tagesschau.de never reach `networkidle` within 25s and fail entirely -- the
capture is lost.

The proposed approach: if the 25s networkidle timeout fires, check whether the
page has already passed DOMContentLoaded or load events. If yes, capture
whatever is rendered (screenshot + HTML) and mark it with metadata indicating
degraded render quality.

Key technical details:
- `defaultRenderer()` (line 277) wraps browser session acquisition, context
  creation, navigation, screenshot, and HTML capture
- On timeout, Playwright throws `TimeoutError` which `categorizeError()` maps
  to `"Page did not finish loading within 25 seconds"` with `retryable: true`
- Currently the entire render result is rejected -- no partial capture
- WACZ bundling signs a `bundleHash` (SHA-256 of canonical datapackage.json)
  with Ed25519. The signing covers whatever artifacts are in the WARC
- The KV record model has `complete` / `failed` / `pending` states with no
  notion of partial or degraded
- Backlog item R16 (Queue migration) has activation trigger "when timeouts >5%"
- Backlog "Capture Fidelity" parking lot includes "[should] Screenshot timing /
  wait-for-load -- When a user reports incomplete renders"

## Planning Consultations

### Consultation 1: Cloudflare Workers Timeout Constraints and Fallback Mechanics

- **Agent**: iac-minion
- **Planning question**: What are the actual hard limits for `ctx.waitUntil()`
  on the Cloudflare Workers paid plan? Is the 30s limit configurable, extendable
  via Queues consumer workers, or bypassable with Durable Objects? If the 30s is
  truly hard, what is the safe headroom to leave (currently 5s)? Is there a way
  to use Playwright's event-based APIs (e.g., `page.waitForLoadState('load')`)
  within a try/catch of the `networkidle` timeout -- i.e., after Playwright
  throws TimeoutError, is the page still usable for `page.screenshot()` and
  `page.content()`?
- **Context to provide**: `src/capture.js` (full file), `wrangler.toml`,
  `src/index.js:130-132` (ctx.waitUntil call), Cloudflare Browser Rendering
  docs, current paid plan limits
- **Why this agent**: iac-minion owns Cloudflare infrastructure knowledge --
  Workers limits, Browser Rendering session lifecycle, and whether the page
  object survives a navigation timeout

### Consultation 2: Evidence Integrity of Partial Captures

- **Agent**: security-minion
- **Planning question**: From an evidence integrity and security perspective,
  is a partial/degraded capture (screenshot + HTML taken after a timeout, before
  networkidle) still valid evidence? What metadata is needed to prevent consumers
  from treating a degraded capture as equivalent to a full one? Does this create
  any new attack surface -- e.g., could a malicious page deliberately delay
  loading to produce a capture at a chosen moment? How should the WACZ signing
  chain handle this -- does the signed bundle need to include the render quality
  metadata, or is it sufficient to have it only in the KV record?
- **Context to provide**: `src/capture.js`, `src/wacz.js`, `src/warc.js`,
  `src/verify.js`, `src/kv.js` (record model), the WACZ signing chain
  (datapackage.json -> bundleHash -> Ed25519 signature)
- **Why this agent**: security-minion evaluates whether degraded captures
  maintain evidence integrity claims and identifies new threat vectors from
  the fallback behavior

### Consultation 3: API Contract and Consumer Experience

- **Agent**: api-design-minion
- **Planning question**: How should the API surface communicate that a capture
  was degraded? Options include: (a) a new field on the capture record
  (e.g., `renderQuality: 'partial'`), (b) a new status value
  (e.g., `status: 'degraded'`), (c) metadata in the WACZ itself. What are the
  backward compatibility implications of each? Should the GET capture endpoint
  expose render quality differently? Should the status endpoint distinguish
  between "pending" and "captured but degraded"? How does this interact with
  the `retryable` flag on failed captures?
- **Context to provide**: `src/kv.js` (record model and lifecycle states),
  `src/index.js` (all endpoint handlers -- GET capture, GET status, list),
  current API contract (pending/complete/failed lifecycle)
- **Why this agent**: api-design-minion evaluates API contract evolution,
  backward compatibility, and consumer expectations for the quality signal

### Cross-Cutting Checklist

- **Testing**: Include for planning -- test-minion should advise on how to test
  the fallback path (simulating heavy pages that exceed networkidle timeout) and
  whether existing tests need updating. The fallback introduces a new code path
  that must be exercised.
- **Security**: INCLUDED above (Consultation 2) -- evidence integrity is the
  core security question.
- **Usability -- Strategy**: Include for planning -- ux-strategy-minion should
  evaluate the consumer experience when they receive a degraded capture. Is
  "partial evidence is better than no evidence" always true? Are there cases
  where a confident failure is preferable to uncertain partial data? What
  should the user journey look like when a degraded capture is retrieved?
- **Usability -- Design**: Exclude from planning -- no user-facing UI is
  affected. This is an API-level change.
- **Documentation**: Include in execution only (Phase 8) -- if the advisory
  recommends implementation, API docs and the capture lifecycle description
  would need updating.
- **Observability**: Include for planning -- understanding how to measure
  timeout rates, degraded capture rates, and the time-budget distribution
  between DOMContentLoaded and networkidle is essential for setting the right
  thresholds and evaluating R16 activation.

### Anticipated Approval Gates

This is an advisory -- no execution gates. The advisory output itself serves
as the decision point for whether to proceed with implementation.

### Rationale

Four specialists are selected for planning:

1. **iac-minion** -- The fundamental constraint question (is 30s hard? can we
   work around it?) determines whether the staged fallback is even necessary or
   whether a platform-level solution (Queues, Durable Objects) is better. Also
   owns the question of whether Playwright's page object survives a timeout.

2. **security-minion** -- This is fundamentally an evidence integrity question.
   WRL's value proposition is "tamper-evident web captures." A degraded capture
   that consumers mistake for a full one undermines trust. The signing chain
   implications are non-trivial.

3. **api-design-minion** -- The capture lifecycle (pending/complete/failed) is
   a published API contract. Adding a quality dimension requires careful design
   to avoid breaking existing consumers and to communicate the degradation
   clearly.

4. **ux-strategy-minion** (cross-cutting, always included) -- The user journey
   question "is partial evidence better than no evidence?" is foundational to
   the entire approach. If the answer is "it depends," the strategy must define
   when each outcome is appropriate.

**Observability** (cross-cutting) is included as a planning question embedded
with iac-minion's consultation rather than a separate consultation -- the
metrics question is tightly coupled to the infrastructure constraints.

**test-minion** is noted for execution-phase inclusion but does not need a
separate planning consultation -- the testing approach follows naturally from
whatever fallback mechanism is chosen.

### Scope

**In scope**:
- Whether the 30s ctx.waitUntil limit is truly hard and what alternatives exist
- Whether Playwright's page survives a navigation timeout for artifact capture
- Evidence integrity implications of partial captures
- Metadata model for communicating render quality to consumers
- WACZ signing chain implications
- API contract evolution for the degraded state
- Whether staged fallback (try networkidle, fall back to load/DOMContentLoaded)
  is sound

**Out of scope**:
- Full implementation of the fallback (advisory only)
- Queue migration (R16) -- related but separate backlog item
- Consent dialog handling (separate concern from timeout)
- Changes to MAX_SUBRESOURCES or MAX_PAGE_BYTES limits
- Multi-tenant implications

### External Skill Integration

No external skills detected in project.
