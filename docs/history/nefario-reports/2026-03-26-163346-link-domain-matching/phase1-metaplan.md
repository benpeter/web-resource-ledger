# Meta-Plan: Link Domain Matching for WRL Emails

## Task Summary

All outbound WRL emails must use the WRL sending domain for clickable links
instead of third-party domains (specifically `invoice.stripe.com`). Only one
email template (`invoice_generated`) has this problem -- `billing.js:380`
passes Stripe's `hosted_invoice_url` directly as `portalUrl`. The fix requires
a redirect endpoint on the WRL domain that forwards recipients to the actual
Stripe invoice URL.

## Planning Consultations

### Consultation 1: Redirect Endpoint Security Design

- **Agent**: security-minion
- **Planning question**: The proposed fix adds a redirect endpoint (e.g.,
  `GET /v1/billing/invoice/:id`) that 302s to a Stripe `hosted_invoice_url`.
  This is textbook open-redirect territory. What validation and constraints
  should the redirect apply? Specifically: should the endpoint store the
  target URL server-side (KV/D1) and look it up by opaque token, or is
  domain-allowlisting the Stripe URL sufficient? Should the redirect require
  authentication, or must it work for unauthenticated email recipients?
  What abuse scenarios should the design defend against?
- **Context to provide**: `src/billing.js` (lines 370-381 showing the
  `hosted_invoice_url` pass-through), `src/index.js` routes table, existing
  open-redirect prevention in `billing.js:75` (returnUrl same-origin check),
  existing KV namespace availability
- **Why this agent**: Open redirects are a well-known vulnerability (CWE-601).
  The entire purpose of this feature is adding a redirect endpoint, so security
  must shape the design, not just review it after the fact.

### Consultation 2: Redirect Endpoint Route and Implementation Approach

- **Agent**: api-design-minion
- **Planning question**: What should the redirect endpoint path look like?
  Options include: (a) `GET /v1/billing/invoice/:token` where token is an
  opaque KV key mapping to the Stripe URL, (b) `GET /invoice/:id` as a
  short vanity path, (c) a signed URL approach where the Stripe URL is
  encrypted/signed in the path itself. Which fits the existing WRL route
  conventions (all under `/v1/` with resource-based paths) and keeps the
  implementation minimal? Should the endpoint return a 301 or 302? Should
  it set cache headers?
- **Context to provide**: `src/index.js` routes table (line 66-134),
  existing billing routes (`/v1/billing/checkout`, `/v1/billing/portal`,
  `/v1/stripe/webhook`), the KV and D1 bindings available in wrangler.toml
- **Why this agent**: The redirect path will appear in customer-facing emails
  and needs to be both clean and consistent with existing API conventions. The
  choice between KV-lookup vs. signed-URL approaches has API design implications.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning? **No.** The scope is narrow
  (one new route, one changed line in `billing.js`). Existing test patterns
  in `test/email-templates.test.js`, `test/notification-triggers.test.js`,
  and `test/email-dispatch.test.js` provide clear templates. Test strategy
  can be specified directly in the execution plan without specialist input.

- **Security**: **Yes** -- included as Consultation 1. This is fundamentally
  an open-redirect risk that security must shape.

- **Usability -- Strategy**: Include for planning? **No.** The user-facing
  change is invisible -- email recipients click a link and arrive at their
  Stripe invoice exactly as before. There is no new user journey, no
  cognitive load change, no simplification opportunity. The UX review in
  Phase 3.5 is sufficient.

- **Usability -- Design**: Include for planning? **No.** No UI changes. The
  email template content and visual design are unchanged. Only the URL in
  the `href` attribute changes.

- **Documentation**: Include for planning? **No.** The change is internal
  plumbing (a redirect endpoint). No API surface consumed by external users
  changes. software-docs-minion can review in Phase 3.5 and assess whether
  any documentation updates are needed post-execution.

- **Observability**: Include for planning? **No.** The redirect endpoint is
  a simple 302. The existing `log()` pattern used throughout the codebase
  is sufficient for any logging needs. No new service or background process
  is introduced.

## Notable Exclusions

- **edge-minion**: The redirect is a simple 302 from the Worker, not a CDN
  rewrite or edge-level routing concern. No caching strategy needed.
- **ux-strategy-minion**: The change is invisible to end users -- same email,
  same destination, different intermediate URL. No journey or cognitive load
  impact worth planning around.
- **data-minion**: Storage choice (KV vs D1 vs signed URL) is a security
  design question here, not a database architecture question. The data is
  a single URL string with a short TTL.

## Anticipated Approval Gates

1. **Redirect mechanism design** (MUST gate): The choice between KV-stored
   URL lookup vs. signed/encrypted URL in the path is a hard-to-reverse
   architectural decision that affects security posture, storage costs, and
   the billing.js webhook handler. Both the security-minion and
   api-design-minion contributions feed into this gate. All downstream
   implementation depends on which approach is chosen.

This is the only gate anticipated. The implementation itself is straightforward
once the mechanism is decided -- one new route handler, one line change in
`billing.js`, and test updates.

## Rationale

This task is narrowly scoped: one email template, one problematic URL, one
fix needed. The two consultations target the only genuine design decisions:

1. **Security** shapes the redirect mechanism to prevent open-redirect abuse.
   This is the primary risk in the task.
2. **API design** shapes the endpoint path and HTTP semantics to fit WRL
   conventions.

Everything else -- implementation, testing, documentation -- follows
deterministically from these two decisions and can be specified in the
execution plan without specialist planning input.

## Scope

**In scope**:
- New redirect endpoint on the WRL domain that forwards to Stripe invoice URLs
- Change `billing.js:380` to generate the WRL redirect URL instead of passing
  `hosted_invoice_url` directly
- Store or encode the Stripe URL so the redirect endpoint can resolve it
- Update existing tests that reference `hosted_invoice_url` / `portalUrl`
- Add tests for the new redirect endpoint

**Out of scope**:
- Resend configuration, DNS/SPF/DKIM setup
- Email template content or visual design changes
- Stripe billing logic
- Other email templates (audit confirmed only `invoice_generated` is affected)

## External Skill Integration

No external skills detected relevant to this task. The `ops-runbook` skill
(`.claude/skills/ops-runbook/SKILL.md`) is a LEAF skill for operational
procedures and is not relevant to planning a redirect endpoint.
