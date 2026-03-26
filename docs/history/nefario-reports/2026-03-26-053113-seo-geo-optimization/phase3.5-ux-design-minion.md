# UX Design Review: FAQ Section

**Verdict: ADVISE**

---

## Assessment

The plan is sound overall. The FAQ content is well-chosen, the static (no-JS) approach is correct, and the `<dl>/<dt>/<dd>` pattern is semantically appropriate for FAQ. Three targeted advisories follow.

---

## Advisories

- [design]: The FAQ section will land after the Pricing section (white background), so it needs a contrasting background to visually separate the two sections -- the plan's instruction to "match visual weight" is ambiguous and risks no background differentiation.
  SCOPE: `landing/public/index.html` — `<section class="faq">` element; `landing/public/css/landing.css` — `.faq` rule
  CHANGE: Apply `landing-section--muted` to the FAQ section (matching the Features and Compare sections, which also follow white-background sections). This is not an arbitrary choice -- it follows the existing white/muted alternation pattern already established in the page: Use Cases (white) → Features (muted) → How It Works (white) → Compare (muted) → Pricing (white) → FAQ (muted). The CSS class already exists; no new token is needed.
  WHY: Without explicit background differentiation, the FAQ section will visually merge with the Pricing section above it. Both carry dense content and similar font weights. The muted background is the existing signal for "new section" on this page -- skipping it breaks the rhythm users have already learned by the time they reach the bottom of the page.
  TASK: Task 2 (landing page SEO + structured data + FAQ)

- [design]: The plan specifies `<dt><h3>...</h3></dt>` -- an `<h3>` nested inside a `<dt>`. This is an unusual nesting. Browsers render it, but the heading semantics and the `<dt>` semantics overlap in a way that is misleading: `<dt>` already implies a term/label role, and wrapping it in `<h3>` creates two simultaneous structural signals for the same text.
  SCOPE: `landing/public/index.html` — FAQ item markup pattern
  CHANGE: Use one of two cleaner patterns. Option A (simpler, recommended): `<dt>` plain text with question, `<dd>` answer -- style `<dt>` with `font-weight: var(--weight-bold)` and `font-size: var(--text-lg)` to give it visual heading weight without the heading element. Option B: Remove the `<dl>` wrapper entirely and use `<h3>/<p>` pairs inside `<div class="faq__item">` -- this is the pattern used in the Features section already (`.feature-item h3` + `p`) and would be fully consistent with the rest of the page. Option B is more consistent with the existing system; Option A is more semantically pure for FAQ. Either is preferable to the nested `<dt><h3>` the plan specifies.
  WHY: Task 3 (Lighthouse audit) will check heading hierarchy. The `<dt><h3>` nesting is not technically invalid HTML, but it creates ambiguity for accessibility tooling that inspects both ARIA landmark/heading roles and definition list semantics simultaneously. Cleaning this up now avoids a finding in Task 3 and a follow-up correction pass.
  TASK: Task 2 (landing page SEO + structured data + FAQ)

- [design]: The nav currently has 5 links plus a Sign In button at the right edge. Adding a sixth link (`#faq`) will push the nav to 6 links plus the button. On compact viewports (600–767px) where `.site-header__wordmark` is already hidden, the nav wraps today. A sixth link will accelerate that wrapping and may push the Sign In button to a second line, cutting off the primary CTA.
  SCOPE: `landing/public/index.html` — `<nav aria-label="Main">` inside `.site-header`; `landing/public/css/landing.css` — `.site-header nav`
  CHANGE: Consider whether the FAQ nav link is load-bearing. FAQ is the last section before the footer -- it is not a destination users navigate to proactively; they scroll to it. If the link is added for completeness, accept the wrapping risk. If the plan's intent is purely SEO (the FAQPage JSON-LD is what matters for rich results, not the nav link), the nav addition is optional and can be dropped. If it is kept, add a `@media (max-width: 840px) { .site-header nav a[href="#faq"] { display: none; } }` rule to suppress the FAQ nav item at sizes where the header is already stressed -- FAQ is the lowest-priority nav destination and the section is findable by scrolling.
  WHY: The Sign In button is the primary conversion action on the entire page. If it wraps to a second line on medium viewports it becomes visually demoted and potentially obscured by the sticky header's fixed height. This is a conversion risk, not just a visual tidiness issue.
  TASK: Task 2 (landing page SEO + structured data + FAQ)
