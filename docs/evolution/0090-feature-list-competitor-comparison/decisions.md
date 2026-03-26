# Decisions: Feature List and Competitor Comparison (#144)

## 1. Feature list uses lightweight list, not cards

The landing page Use Cases section already uses the `.card` component heavily.
Using cards again for features would create "card fatigue" and no visual
contrast between sections. The lightweight grid (heading + description, no
borders) lets the content breathe.

Over: Card-based grid with `.card` class and badge icons (frontend-minion).

## 2. Landing comparison: 4 competitors x 4 feature columns

The landing page gets a summary table, not the full matrix. Four competitors
(Wayback Machine, PageFreezer, Webrecorder, Manual + Notary) were chosen to
maximize recognition, enterprise credibility, technical respect, and common
practice. Four feature columns (Crypto Signing, Independent Timestamps, Public
Verification, Open Format) highlight WRL's core differentiators.

Over: Full 9-competitor table on landing (rejected: too dense per UX review).

## 3. Docs comparison page is .njk, not .md

The mobile-responsive card-stack pattern requires `data-label` attributes on
`<td>` elements. Markdown tables cannot produce custom HTML attributes.
Precedent: `api-reference.njk` already uses Nunjucks for structured HTML content.

Over: Markdown file (software-docs-minion).

## 4. Single /compare/ page on docs (no separate features page)

The comparison table already implies feature coverage. A separate features page
would duplicate information and create maintenance burden with no clear user
benefit. The landing page feature list links directly to the comparison page.

Over: Separate /features/ + /compare/ pages.

## 5. "Features" in landing nav, "Compare" excluded

Adding "Features" to the header nav gives it 5 content links + Sign in, which
is at the scannable limit. Adding "Compare" would push to 6 content links and
comparison is a secondary evaluation step, not a primary navigation target.

## 6. Docs SEO infrastructure deferred

Template-level SEO changes (canonical tags, OG tags, BreadcrumbList) affect
all 15+ docs pages and deserve their own review cycle. Added to backlog.

Over: Including template-level fixes in this task (seo-minion).

## 7. Competitor data: public sources only, with methodology disclosure

Every cell in the comparison table is a factual assertion verifiable by
competitors and the web archiving community. The methodology section discloses
the "last verified" date (March 2026), uses "Not documented" instead of "No"
when uncertain, and links to GitHub issues for corrections.

## 8. Background alternation fix

Inserting two new sections required changing How It Works from `--muted` to
`--white` to maintain the alternating background pattern across all 5 content
sections: white, muted, white, muted, white.

## 9. aria-hidden removed from thead (post-review fix)

Initially added `aria-hidden="true"` to `<thead>` per accessibility-minion's
Phase 3.5 recommendation. Code review identified this was incorrect: the
`.sr-only` CSS positioning already handles visual hiding for mobile, and
the attribute unnecessarily removed column headers from screen readers on
desktop viewports. Removed in the code review fix commit.
