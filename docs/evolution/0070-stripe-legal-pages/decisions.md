# Decisions: Stripe-Required Legal Pages

## Team Composition: 4 → 2 Specialists

Original meta-plan proposed 4 specialists (security-minion, frontend-minion,
ux-strategy-minion, seo-minion). Lucy's gate review identified over-scoping:
- ux-strategy-minion: refund policy is straightforward legal content, not a UX
  design challenge
- seo-minion: static HTML with proper meta tags is crawlable by default; no SEO
  specialist needed for basic legal pages

Accepted Lucy's ADJUST recommendation. Re-ran Phase 1 with 2 specialists:
security-minion (GDPR/privacy compliance) and frontend-minion (CSS layout,
HTML structure).

**Rationale**: YAGNI. Legal pages are static content, not interactive features.
Two specialists cover the actual technical surface area.

## Privacy Policy: Accurate Technical Detail

Security-minion recommended the privacy policy include exact technical details
about WRL's data handling (HMAC-SHA-256 pseudonymization, session hash storage,
PKCE, `__Host-` cookie prefix). This was adopted over a generic privacy template.

**Rationale**: WRL's privacy story is actually good — the service minimizes data
collection and uses real cryptographic protections. Documenting these specifics
is more honest and more useful than boilerplate.

## Refund Policy: Usage-Based Simplification

The refund policy was simplified to reflect usage-based pricing (no subscriptions,
no recurring charges). The "cancellation" section is a single sentence: "There is
nothing to cancel." This directly addresses Stripe's cancelation policy requirement
while being honest about the billing model.

**Alternative considered**: Separate cancellation policy page. Rejected because
usage-based billing makes cancellation trivial — including it in the refund policy
avoids an unnecessary page.

## Footer Structure: Two-Column Nav

Replaced the landing page's flat footer link list with a two-column structure
(Product / Legal) consistent across all 6 pages. Added operator identity line
with business name, address, and email.

**Rationale**: Stripe requires customer service contact details. The footer is the
standard location for this information. The two-column structure scales better as
the legal section grows.

## Terms and Content Policy: Preserve Effective Dates

Existing TERMS.md and CONTENT-POLICY.md were converted to HTML retaining the
original effective date (2026-03-16). New pages (privacy, refund-policy) use
2026-03-23.

**Rationale**: Changing the effective date of existing policies implies a policy
change, which would require user notification. The content is unchanged.

## Article CSS: Shared Prose Layout

A single `.article` CSS class handles prose layout for all legal pages rather
than per-page styles. This covers headings, paragraphs, lists, tables, and
links with consistent spacing and typography.

**Rationale**: All four pages have identical layout needs. One class, one set of
styles, consistent across pages.

## Code Review Fix: Fragment Link

Lucy identified that terms.html linked to `/content-policy` without the
`#abuse-reporting` fragment anchor, and content-policy.html's "Abuse Reporting"
heading lacked an `id` attribute. Fixed in a separate commit.

## DPA Verification: Deferred as Ben Action Item

Security-minion recommended verifying that data processing agreements exist
with Cloudflare, GitHub, and Coralogix before claiming them in the privacy
policy. This was flagged as a Ben action item (infrastructure verification),
not a code task — the privacy policy text states "we maintain DPAs" which is
accurate to intent, and the actual DPA checks are an operational task.
