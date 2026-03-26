# Process -- 0096 Link Domain Matching

## TL;DR

Two specialist agents (security-minion, api-design-minion) planned an
HMAC-signed invoice redirect endpoint. Five architecture reviewers
unanimously approved. One execution agent implemented the full change.
Code review caught a missing null-guard on SESSION_SECRET that would
have caused Stripe webhook retry storms. Total: 1 new module, 18 new
tests, 1654 tests passing, 3 modified files. All done in a single PR.

## Phase 1: Meta-Plan

Nefario analyzed the task and identified two planning consultations:

1. **security-minion** -- because the feature is fundamentally a redirect
   endpoint, which is textbook open-redirect territory (CWE-601). Security
   needed to shape the design, not just review it.

2. **api-design-minion** -- because the redirect URL appears in
   customer-facing emails and must fit existing route conventions.

The meta-plan correctly identified that only 1 of 7 email templates had
the domain mismatch problem (`invoice_generated` with Stripe's
`hosted_invoice_url`), keeping the scope contained.

## Phase 2: Specialist Planning

### security-minion

Recommended an HMAC-signed redirect approach rather than KV-stored lookup
keys. Key arguments:

- HMAC tokens are stateless -- no KV storage, no cleanup, no state management
- `SESSION_SECRET` is already available and used for other HMAC tokens
- Domain prefix `"redir."` for generic future use
- Broader 4-domain Stripe allowlist (invoice, pay, checkout, billing)
- 302 redirect to `/ui#billing` on failure (never expose error details)

### api-design-minion

Agreed on HMAC-signed approach but differed on specifics:

- Domain prefix `"inv."` for tighter scoping
- Route path `GET /v1/billing/invoice?token=` following existing conventions
- Single-domain allowlist (`invoice.stripe.com` only)
- 200 HTML error page matching unsubscribe pattern
- URL-only payload with optional `t: tenantId` for audit logging

### Where they disagreed

Five conflicts emerged. All were resolved in synthesis, each favoring
the simpler or more consistent option:

| Conflict | security-minion | api-design-minion | Chosen | Reason |
|----------|----------------|-------------------|--------|--------|
| Domain prefix | `"redir."` | `"inv."` | `"inv."` | YAGNI |
| Route path | `/r/:token` | `/v1/billing/invoice?token=` | `/v1/billing/invoice` | Consistency |
| Allowlist scope | 4 Stripe domains | `invoice.stripe.com` only | Single domain | YAGNI |
| Error response | 302 to `/ui#billing` | 200 HTML page | 200 HTML | Pattern match |
| Module strategy | Extract `src/hmac.js` | Duplicate helpers | Duplicate | Convention |

## Phase 3.5: Architecture Review

Five reviewers, all APPROVE:

- **lucy** -- verified requirements traceability (all 6 success criteria
  mapped to plan elements), confirmed CLAUDE.md compliance, no drift
- **margo** -- confirmed complexity is proportional: zero new dependencies,
  zero new services, one module following an established pattern. Noted 3
  HMAC helper copies approaching extraction threshold but accepted the
  convention-following choice
- **security-minion** -- verified HMAC correctness (`crypto.subtle.verify`
  for timing-safe comparison), domain prefix separation, open redirect
  defense. Flagged that `new URL(decoded.u)` must be in try/catch for the
  never-throws contract -- this was incorporated into the execution prompt
- **test-minion** -- validated test plan completeness, confirmed no gaps,
  noted existing `notification-triggers.test.js` doesn't need modification
- **ux-strategy-minion** -- confirmed zero user-facing impact, suggested
  "your account dashboard" wording over "billing portal in your dashboard"
  for the error page

The security-minion's `new URL()` try/catch observation and
ux-strategy-minion's wording suggestion were both folded into the
execution prompt as architecture review notes.

## Phase 4: Execution

Single execution agent (security-minion, sonnet model) implemented all
four deliverables:

1. `src/invoice-redirect.js` -- the HMAC redirect module
2. `src/index.js` modifications -- route, rate limit, auth exemption
3. `src/billing.js` modification -- replace raw Stripe URL with redirect
4. `test/invoice-redirect.test.js` -- 18 tests

All 1654 tests passed on first run.

## Phase 5: Code Review

Three reviewers ran in parallel:

- **code-review-minion** -- ADVISE: noted `t.assert.ok(url.startsWith(...))`
  could use `t.assert.match()` for better failure messages. Kept current
  style for consistency.
- **lucy** -- ADVISE: caught that `billing.js:handleInvoiceFinalized` would
  throw if `SESSION_SECRET` was undefined, causing Stripe webhook retry
  storms in environments without the secret deployed. This was the most
  valuable finding of the entire phase.
- **margo** -- APPROVE: no unnecessary complexity

The SESSION_SECRET null-guard was fixed immediately and committed as a
separate fix commit: `fix(billing): guard against missing SESSION_SECRET
in invoice redirect`. This added `&& env.SESSION_SECRET` to the ternary
condition, making it fall back to `/ui#billing` when the secret isn't
available.

## Phase 8: Documentation

Phase 8a identified one documentation surface needing update: the OpenAPI
spec (`openapi.yaml`). A `billing` tag and `GET /v1/billing/invoice`
endpoint were added with 200/302/429 responses. `npm run lint:api` passed
with only pre-existing warnings.

All other surfaces (docs site, landing page, MCP server, legal pages)
needed no updates -- the redirect is internal email plumbing, not a
user-facing feature.

## Where to read more

- Synthesis with all conflict resolutions: `docs/history/nefario-reports/` (companion directory)
- Architecture review verdicts: same companion directory (`phase3.5-*.md`)
- Decisions rationale: `docs/evolution/0096-link-domain-matching/decisions.md`
- Implementation outcome: `docs/evolution/0096-link-domain-matching/outcome.md`
