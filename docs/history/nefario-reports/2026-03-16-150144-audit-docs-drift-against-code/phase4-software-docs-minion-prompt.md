You are adding status headers to two historical documents in the
web-resource-ledger project to frame them correctly for newcomers.

## Context

PRODUCT.md (repo root) is the original product vision document from the
planning phase. docs/MVP.md is the implementation plan for the initial
build (phases 0001-0011). Both documents describe a state that no longer
reflects reality -- PRODUCT.md describes a full SaaS platform with billing
and RBAC, MVP.md references Puppeteer and implementation steps that are all
complete.

These files are referenced by `docs/backlog.md` (5 references to MVP.md)
and by evolution log entries (15+ references). They must NOT be moved or
renamed -- that would break cross-references in historical records.

## What to do

**1. Add status header to PRODUCT.md**

Add a blockquote at the very top of the file (before the first heading):

```markdown
> **This is the original product vision document.** It describes the full
> scope of what WRL could become. For what has actually been built, see the
> [README](README.md). For current priorities, see
> [docs/backlog.md](docs/backlog.md). For how each feature was implemented,
> see [docs/evolution/](docs/evolution/).
```

**2. Add status header to docs/MVP.md**

Add a blockquote at the very top of the file (before the first heading):

```markdown
> **This document is a historical artifact.** It was the implementation
> plan for WRL's initial build (phases 0001-0011, March 2025). All items
> are now implemented, deferred to [docs/backlog.md](backlog.md), or
> explicitly dropped. The document is preserved for traceability -- the
> evolution log phases reference it.
```

## What NOT to do

- Do NOT modify any content in the body of either document
- Do NOT move or rename either file
- Do NOT remove the existing inline "Resolved" annotations in MVP.md
- Do NOT update links in other files
- Do NOT add status headers to any other files

## Files to modify

- `PRODUCT.md`
- `docs/MVP.md`

## Deliverables

Both files with status header blockquotes at the top.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
