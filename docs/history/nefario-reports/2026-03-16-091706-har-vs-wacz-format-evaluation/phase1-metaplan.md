# Meta-Plan: HAR vs WACZ Format Evaluation

## Context

This is a **technical advisory** question, not an implementation task. The user
wants to know:

1. Whether WRL should switch its archive format from WACZ to HAR
2. Whether WRL is already leveraging Playwright's HAR recording capabilities

### Current State

- WRL captures: screenshot (PNG) + rendered HTML + HTTP headers (separate Workers fetch)
- Artifacts bundled into WACZ format (ZIP containing WARC records + SHA-256 manifest + Ed25519 signature)
- `@cloudflare/playwright` is used for browser rendering but **zero HAR capabilities are used** (no `recordHar`, no `routeFromHAR`)
- WACZ was a deliberate MVP decision (0001-kickoff/decisions.md) chosen for: legal pedigree (Harvard LIL, Library of Congress, Starling Lab), built-in integrity verification, additive upgrade path
- The backlog explicitly dropped "Full HTTP exchange capture" and "Sub-resource archiving" as out of scope
- The capture pipeline already has `context.route('**/*')` intercepting all requests for safety limits (subresource counting, cross-domain blocking) -- this infrastructure could theoretically be extended

### What This Question Really Asks

This is a format comparison with architectural implications. It touches:

1. **Archive format tradeoffs** (WACZ/WARC vs HAR) -- standards, tooling, legal weight, ecosystem
2. **Playwright capabilities** -- what `recordHar()` actually captures vs what WRL currently collects
3. **Whether HAR recording could *complement* WACZ** rather than replace it (HAR as a capture mechanism feeding into WARC records)

---

## Planning Consultations

### Consultation 1: Technology Landscape and Format Comparison

- **Agent**: gru
- **Planning question**: Compare HAR and WACZ/WARC as web archive formats for an evidence-grade capture system. Evaluate: (a) HAR spec maturity and legal standing vs WACZ's legal pedigree, (b) whether HAR is a replacement for or complement to WARC/WACZ, (c) the @cloudflare/playwright `recordHar()` API -- what it captures (full request/response bodies, timing, headers) vs what WRL currently captures, (d) ecosystem tooling for each format, (e) whether a hybrid approach (use Playwright HAR recording to capture richer network data, then embed that data into WARC records within the existing WACZ container) would be architecturally sound. Consider that WRL's "Full HTTP exchange capture" and "Resource manifest" are both in the Dropped Items section of the backlog -- would HAR recording be a lightweight way to get partial credit on those capabilities without the complexity that caused them to be dropped?
- **Context to provide**: `src/capture.js` (current pipeline, especially `defaultRenderer` and `context.route`), `src/wacz.js` and `src/warc.js` (current bundling), `docs/evolution/0001-kickoff/decisions.md` (WACZ rationale), `docs/backlog.md` (dropped items: "Full HTTP exchange capture", "Sub-resource archiving", "Resource manifest")
- **Why this agent**: gru evaluates technology landscape, format comparisons, and adopt/hold/wait decisions. This is fundamentally a technology radar question -- should WRL adopt HAR, hold with WACZ, or use HAR as a complementary capture mechanism?

### Consultation 2: Capture Pipeline Architecture

- **Agent**: iac-minion
- **Planning question**: Evaluate the operational implications of adding Playwright `recordHar()` to WRL's capture pipeline on Cloudflare Workers. Specifically: (a) does `@cloudflare/playwright` support `browserContext.recordHar()` given the `connect()`/`acquire()` session model? (b) HAR files contain full response bodies -- what are the storage and memory implications within the Worker's memory limits and the 30s `ctx.waitUntil` budget? (c) if HAR recording is feasible, where does the HAR file land (local filesystem? in-memory?) and how does that interact with Workers' lack of a real filesystem? (d) would HAR recording conflict with the existing `context.route('**/*')` interception used for safety limits?
- **Context to provide**: `src/capture.js` (session model, route interception, timeout budgets), `wrangler.toml` (Worker configuration), Cloudflare Browser Rendering documentation constraints
- **Why this agent**: iac-minion understands Cloudflare Workers runtime constraints, Browser Rendering binding limitations, and can assess whether HAR recording is even technically feasible in this deployment model before we debate format merits.

---

## Cross-Cutting Checklist

- **Testing**: NOT included for planning. This is an advisory -- no code will be produced.
- **Security**: NOT included for planning. If the advisory recommends adoption, security review would be part of the implementation plan. For the advisory itself, gru covers format-level security properties (integrity, legal weight).
- **Usability -- Strategy**: NOT included for planning. This is an internal format/architecture question with no user-facing UX impact. The verification page and API contract are unaffected by the internal archive format.
- **Usability -- Design**: NOT included. No UI involved.
- **Documentation**: NOT included for planning. Advisory output is self-documenting. If adoption proceeds, documentation would be part of implementation.
- **Observability**: NOT included. No runtime changes in scope.

**Rationale for lean staffing**: This is a focused technical advisory on a format comparison question. Two specialists cover the necessary ground: gru for the technology/format evaluation (the core question), iac-minion for the Cloudflare-specific feasibility constraints (the "can we even do this" gate). Adding more specialists would over-staff a question that has a clear answer structure.

---

## Anticipated Approval Gates

None. This is an advisory -- no code changes, no irreversible decisions. The advisory itself will present recommendations that the user can choose to act on.

---

## Rationale

The question has two layers:

1. **Should we switch formats?** -- This is gru's domain. WACZ was a deliberate, well-reasoned choice. The question is whether HAR offers something WACZ doesn't, or whether HAR recording is a complementary capture technique rather than a format replacement.

2. **Can we even use Playwright's HAR features?** -- This is iac-minion's domain. `@cloudflare/playwright` is a constrained subset of Playwright running on Workers. `recordHar()` writes to a filesystem path, and Workers don't have a traditional filesystem. This may be a hard blocker that makes the format question moot.

The likely outcome is that HAR and WACZ serve different purposes: HAR is a capture/debug format (network traffic log), while WACZ is an archival/evidentiary format (integrity-verified bundle). The advisory should clarify this distinction and recommend whether Playwright HAR recording could enrich the data flowing into the existing WACZ pipeline.

---

## Scope

- **In scope**: Format comparison (HAR vs WACZ), Playwright HAR recording capabilities, feasibility on Cloudflare Workers, recommendation (adopt/hold/complement)
- **Out of scope**: Implementation plan, code changes, sub-resource archiving strategy, full HTTP exchange capture design

---

## External Skill Integration

No external skills detected in project.
