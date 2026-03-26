## UX Strategy Review

**Verdict: APPROVE**

### Assessment

This change is transparent to end users. A recipient clicks a link in an invoice email and lands at the same Stripe invoice page. The URL in the middle is invisible -- they never see it, never type it, never need to reason about it. Zero cognitive load impact. Zero journey change.

The one user-facing surface is the HTML error page for invalid/expired tokens. The plan reuses the established unsubscribe error page pattern: WRL branding, plain-language heading, fallback link to `/ui#billing`. This is the correct call. An error page that looks and reads like every other error page in the system is a better experience than a custom one. Pattern consistency here directly serves users -- it reduces surprise and provides a clear recovery path.

### One observation (not blocking)

The error page copy reads: "This invoice link is not valid. You can view your invoices from the billing portal in your dashboard."

The phrase "billing portal" is slightly ambiguous -- it could refer to the Stripe Customer Portal or to the WRL dashboard. Since the link goes to `/ui#billing` (the WRL dashboard), consider tightening to "your WRL dashboard" or simply "your account dashboard" to remove ambiguity. This is cosmetic; implementation can proceed as written.

### JTBD alignment

The job: "When I receive an invoice email, I want to view and pay my invoice, so I can keep my WRL account active."

The redirect is invisible infrastructure serving that job without adding steps, choices, or friction. The fallback error page covers the failure case with a single recovery action. No progressive disclosure needed, no decision points added. The plan is well-scoped.
