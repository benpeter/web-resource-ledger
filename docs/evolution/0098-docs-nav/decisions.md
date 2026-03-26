# Decisions

## Data model: array of section objects vs. mixed flat+group

**Chosen**: Array of `{ section, children }` objects -- every item belongs to a
section. No flat items at the top level.

**Alternative considered**: Mixed model where top-level items could be either a
link or a section. Rejected because it adds template complexity for no benefit;
every page logically belongs to a category.

## Section groupings

Three sections chosen based on content purpose:

- **Guides** -- task-oriented docs a developer follows to accomplish something
  (Getting Started, Authentication, Verification, Legal Evidence, Batch, Schedules)
- **Reference** -- look-up material (API Reference, Limits, Webhooks, MCP,
  Architecture, Compare)
- **Security & Compliance** -- enterprise/legal material (Overview, Whitepaper,
  DPA, Subprocessors, Incident Response, Data Retention)

Schedules page existed as content (`schedules.md`) but was missing from the nav.
Added it to the Guides section.

## Section heading style

Used `<h2>` elements with `docs-nav-heading` class for semantic structure.
Styled as small uppercase muted labels (same pattern used by Stripe docs,
Cloudflare docs, MDN). Not interactive -- always visible, no collapse.

## Nav link indentation and size

Links shifted slightly right (`padding-left: var(--space-5)`) and set to
`--text-sm` to create visual hierarchy under the section headings, which use
`--text-xs` uppercase. This differentiates the two levels without heavy
indentation.

## No JavaScript

Both desktop and mobile nav use pure HTML/CSS. The mobile `<details>` element
continues to work as before -- it now wraps the sectioned nav instead of a flat
list. No toggle behavior for sections themselves.
