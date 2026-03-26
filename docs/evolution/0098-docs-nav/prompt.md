# Phase 0098: Docs Nav Hierarchy

Issue #235: "Docs: add 2-level hierarchy to left rail navigation"

## Problem

The docs site left rail navigation is flat -- all pages listed at the same
level with no grouping. As the docs grow (21 pages across guides, reference,
and compliance), finding things becomes harder.

## Task

Introduce a 2-level hierarchy in the left rail menu. Both levels should be
always expanded (no collapsing/toggling) so all pages are visible at a glance,
but grouped under logical sections.

## Scope

- Restructure `site/_data/site.js` nav array from flat items to grouped sections
- Update `site/_includes/layouts/base.njk` to render section headings with
  nested link lists (both desktop and mobile)
- Add CSS for section headings (uppercase, muted, smaller type)
- Keep it simple -- no JavaScript, no collapse/expand, no new dependencies
