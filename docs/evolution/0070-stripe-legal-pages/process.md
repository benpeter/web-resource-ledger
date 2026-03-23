# Process: Stripe-Required Legal Pages

## TL;DR

Two specialists (security-minion, frontend-minion) planned four static HTML
legal pages for Stripe business website verification. Lucy's gate review cut
the team from 4 to 2 by removing ux-strategy-minion and seo-minion as
unnecessary for static legal content. One code review finding (missing fragment
link) was caught and fixed. Total: 3 commits, 37 files changed, ~$16 of $40
budget. PR #145.

## Team Selection: The Right Agents for Static Content

The meta-plan initially proposed four specialists: security-minion (GDPR),
frontend-minion (HTML/CSS), ux-strategy-minion (refund policy user journey),
and seo-minion (crawlability). Lucy's gate review pushed back on two:

- **ux-strategy-minion**: Lucy argued that a refund policy for a usage-based
  API is not a UX design challenge — it's a legal content page. The "user
  journey" is reading a policy, not navigating an interface.
- **seo-minion**: Static HTML with proper meta tags, canonical URLs, and a
  sitemap is crawlable by default. No SEO specialist needed for pages that
  search engines handle natively.

This was the right call. The phase produced exactly zero issues that either
dropped specialist could have caught. Security-minion covered GDPR compliance
(the real technical surface area), and frontend-minion handled the HTML/CSS
layout.

## What the Specialists Argued

### security-minion
Pushed for technical accuracy in the privacy policy rather than generic
boilerplate. Recommended documenting WRL's actual data handling practices:
HMAC-SHA-256 IP pseudonymization with daily key rotation, session token
SHA-256 hashing, OAuth PKCE, `__Host-` cookie prefix. Also recommended a
legal basis table mapping each data category to a GDPR article, a data
retention table, and a third-party processor table.

The DPA (Data Processing Agreement) verification was flagged as an operational
task for Ben rather than a code task — the privacy policy states "we maintain
DPAs" which is accurate to intent, and the actual verification involves
checking Cloudflare, GitHub, and Coralogix account dashboards.

### frontend-minion
Proposed a shared `.article` CSS class for all legal pages rather than
per-page styles. Recommended the two-column footer structure (Product / Legal)
as a scalable pattern. Specified responsive breakpoints, table styles, and
link styling consistent with the existing design-system.css custom properties.

The two specialists didn't disagree on anything — their domains were cleanly
separated. Security-minion owned content, frontend-minion owned presentation.

## Architecture Review

Five mandatory reviewers, no discretionary. Results:

- **security-minion** (ADVISE): DPA verification — operational task, not a
  code change. Flagged for Ben.
- **test-minion** (APPROVE): No testable runtime behavior. Static HTML
  verification is visual, not automated.
- **ux-strategy-minion** (APPROVE): Clear layout, consistent nav, good
  mobile responsive design.
- **lucy** (ADVISE): URL routing depends on Cloudflare auto-trailing-slash.
  Already confirmed working via existing landing page (index.html serves at /).
- **margo** (APPROVE): Right-sized, no over-engineering.

No BLOCKs, no revision rounds needed. The advisories were informational,
not plan-changing.

## Execution

Two tasks, one approval gate:

**Task 1** (CSS): frontend-minion added ~80 lines of article/prose styles and
footer restructuring. Straightforward CSS work — no surprises.

**Task 2** (HTML pages): frontend-minion created all four pages plus footer
updates. The gate verified all 9 success criteria from the issue. The main
content work was the privacy policy (315 lines) and refund policy (128 lines)
— the terms and content policy were converted from existing markdown files
with minimal changes.

## Code Review: One Real Finding

Three reviewers ran in parallel:

- **code-review-minion** (APPROVE): No issues found.
- **lucy** (ADVISE): Caught a real bug — terms.html linked to `/content-policy`
  but didn't include the `#abuse-reporting` fragment anchor, and
  content-policy.html's "Abuse Reporting" heading lacked an `id` attribute.
  Both sides of the link were broken. Fixed in a separate commit.
- **margo** (ADVISE): Noted footer HTML duplication across 6 files. Flagged as
  acceptable — these are static HTML files with no templating system. The HTML
  comment markers ("Shared footer: update in all pages") are the maintenance
  strategy.

The fragment link fix was the only code change in post-execution. It's the
kind of cross-page consistency issue that's easy to miss during creation and
exactly what code review is for.

## Human Interventions

This ran in autonomous mode (no human present). Lucy served as gate
decision-maker:

- **Team gate**: Lucy ADJUSTED (removed 2 specialists) — correct call
- **Reviewer gate**: Auto-approved (no discretionary reviewers)
- **Execution plan gate**: Lucy approved — plan was right-sized
- **Task 2 gate**: Lucy approved — all success criteria met
- **Post-execution**: "Run all" selected
- **PR gate**: "Create PR" selected

No interventions were needed. The autonomous mode worked cleanly for this
scope of work.

## Where to Read More

- **Specialist discussions**: `docs/history/nefario-reports/2026-03-23-053840-stripe-legal-pages/`
  - `phase2-security-minion.md` — GDPR analysis, privacy policy recommendations
  - `phase2-frontend-minion.md` — CSS architecture, footer structure proposal
  - `phase3-synthesis.md` — full execution plan with task prompts
  - `phase3.5-*.md` — reviewer verdicts
  - `phase5-*.md` — code review findings
- **Evolution log**: `docs/evolution/0070-stripe-legal-pages/`
- **Issue**: GitHub Issue #131
- **PR**: #145
