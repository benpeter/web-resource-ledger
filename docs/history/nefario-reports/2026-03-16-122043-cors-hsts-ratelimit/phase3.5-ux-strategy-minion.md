## UX Strategy Review -- CORS, HSTS, X-RateLimit-Limit

**Verdict: APPROVE**

---

### Journey Coherence

The three features form a coherent bundle from an API consumer's perspective. CORS unblocks browser clients. HSTS protects those connections. X-RateLimit-Limit gives clients the information to self-regulate. A developer integrating for the first time benefits from all three landing together -- each feature addresses a different friction point in the same onboarding arc.

The error-response CORS coverage (401, 400, 429 all carry CORS headers) is the highest-impact UX decision in the plan. Without it, developers debugging auth errors in browser contexts see a CORS failure masking the real problem. The global pipeline injection approach that produces this coverage is the right architectural choice.

### Cognitive Load Assessment

The plan reduces developer cognitive load in two concrete ways:

1. X-RateLimit-Limit makes rate limits self-documenting at the response layer. Developers no longer have to cross-reference documentation to find the ceiling -- it arrives with every response. The decision to omit Remaining and Reset is correct: inaccurate headers (Cloudflare binding does not expose remaining tokens) are worse than absent ones. Partial information creates false confidence.

2. The empty-allowlist default for CORS is a secure, predictable starting state. Developers know what to expect: no CORS until explicitly configured. The commented example in wrangler.toml gives them the affordance to discover configuration without reading a separate document.

The suppression of global capacity (200/min) from X-RateLimit-Limit is the right omission. Exposing it would add a number developers would misinterpret as their personal budget when it is actually a shared ceiling.

### Simplification

The plan is already minimal. No further consolidation is available.

The single `src/rate-limits.js` config object is the correct pattern -- one sync point with wrangler.toml rather than four (two vars sections, two binding definitions). The comment warning that the constants must match wrangler.toml values is the appropriate documentation for that obligation.

Not documenting OPTIONS as a separate OpenAPI operation is correct. It is a browser mechanism, not an application-level contract. Surfacing it as a first-class operation would add noise for developers reading the spec without adding information value.

### No Blocking Issues

All three prior ux-strategy-minion recommendations are incorporated: terse env var name (CORS_ORIGINS), CORS headers on error responses, and the rate-limits.js config pattern. The plan is ready for execution.
