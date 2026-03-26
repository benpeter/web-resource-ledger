---
slug: link-domain-matching
source-issue: 216
source-issue-title: "Align email link domains with sending domain to avoid spam filters"
timestamp: 2026-03-26T16:33:46Z
branch: nefario/link-domain-matching
evolution-phase: "0096"
team: security-minion, api-design-minion
reviewers: lucy, margo, security-minion, test-minion, ux-strategy-minion
tasks: 1
result: success
---

# Nefario Report: Link Domain Matching

## Summary

Implemented HMAC-signed invoice redirect endpoint to replace raw Stripe
URLs in outbound emails with WRL-domain URLs, eliminating spam filter
penalties from domain mismatches. One new module, 18 new tests, 1654
total tests passing.

## Team

| Agent | Role | Phase |
|-------|------|-------|
| security-minion | Planning: redirect security design | 2 |
| api-design-minion | Planning: route and implementation approach | 2 |
| lucy | Review: convention adherence, intent drift | 3.5, 5 |
| margo | Review: complexity assessment | 3.5, 5 |
| security-minion | Review: security verification | 3.5 |
| test-minion | Review: test plan validation | 3.5 |
| ux-strategy-minion | Review: user experience impact | 3.5 |
| security-minion | Execution: implementation | 4 |
| code-review-minion | Review: code quality | 5 |
| software-docs-minion | Documentation: OpenAPI spec | 8 |

## Conflict Resolutions

5 conflicts between security-minion and api-design-minion, all resolved
in favor of YAGNI/consistency:

1. Domain prefix: `"inv."` over `"redir."` (YAGNI)
2. Route path: `/v1/billing/invoice?token=` over `/r/:token` (consistency)
3. Allowlist: `invoice.stripe.com` only over 4 domains (YAGNI)
4. Error response: 200 HTML over 302 fallback (pattern match)
5. Module strategy: duplicate helpers over shared extraction (convention)

## Architecture Review

5 APPROVE, 0 BLOCK, 0 ADVISE.

Notable contributions folded into execution:
- security-minion: `new URL(decoded.u)` must be in try/catch
- ux-strategy-minion: "your account dashboard" wording preferred

## Code Review Findings

- **lucy (ADVISE, fixed)**: Missing SESSION_SECRET null-guard in
  `handleInvoiceFinalized` would cause Stripe webhook retry storms.
  Fixed as separate commit.
- **code-review-minion (ADVISE, noted)**: `t.assert.ok` could use
  `t.assert.match`. Kept for pattern consistency.
- **margo (APPROVE)**: No unnecessary complexity.

## Files Changed

| File | Change |
|------|--------|
| `src/invoice-redirect.js` | New: HMAC redirect module (~170 lines) |
| `src/index.js` | Modified: route, rate limit, auth exemption (+11 lines) |
| `src/billing.js` | Modified: generate redirect URL in webhook (+6 lines) |
| `test/invoice-redirect.test.js` | New: 18 tests (~385 lines) |
| `openapi.yaml` | Modified: billing tag + endpoint (+55 lines) |

## Evolution Log

`docs/evolution/0096-link-domain-matching/`
