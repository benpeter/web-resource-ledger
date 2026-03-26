## Domain Plan Contribution: software-docs-minion

### Recommendations

**Location: `docs/INTERNALS.md`**

The document should live at `docs/INTERNALS.md` -- a single, flat file in the existing `docs/` directory. Here is the reasoning:

1. **Not `.claude/rules/`**. Rules files are auto-loaded into every Claude Code conversation and must be tiny (the existing five files total 41 lines). A comprehensive internals reference covering D1 schema, API routes, KV namespaces, R2 buckets, env vars, and wrangler config will be 200-400 lines. Auto-loading that into every conversation wastes context on tasks that don't need it (CSS changes, docs edits, CI fixes). Rules files should remain compact pointers and behavioral directives, not reference material.

2. **Not `CLAUDE.md`**. Already 112 lines of project philosophy and process rules. Adding technical reference here would blur the distinction between "how to work on this project" (CLAUDE.md) and "how this project works internally" (the new doc). These are different audiences even when the audience is an LLM.

3. **Not `docs/operations/`**. That directory contains runbooks -- procedural documents for incident response. An internals reference is structural, not procedural.

4. **Not a new subdirectory like `docs/reference/`**. The project has one reference doc to write. Creating a directory for a single file violates YAGNI and the Helix Manifesto's lean-and-mean principle. If more reference docs accumulate later, refactor then.

5. **`docs/INTERNALS.md` specifically** because:
   - `docs/` is where human-and-LLM-readable project documentation already lives (`mcp.md`, `audit-log-schema.md`, `style-guide.md`, `backlog.md`)
   - The `INTERNALS` name signals "system guts" clearly to both humans and LLMs
   - Uppercase filename follows the project's convention for important root-level docs (`OPERATIONS.md`, `CLAUDE.md`) while the `docs/` location keeps it out of the repo root clutter
   - LLMs can be pointed to it via a one-line addition to `.claude/rules/` (see proposed tasks below)

**Cross-referencing strategy:**

- Add a one-line `.claude/rules/wrl-internals.md` file that tells Claude Code where to find the internals doc. Something like: "For D1 schema, API routes, KV/R2 bindings, and env vars, see `docs/INTERNALS.md`." This gives LLMs the pointer without loading the full reference into every conversation.
- `OPERATIONS.md` should get a "See also" line pointing to `docs/INTERNALS.md` for binding/schema details. No content duplication.
- `docs/mcp.md` needs no changes -- it documents the MCP server for external consumers, not internal structure.

**What this document should NOT duplicate:**

- API endpoint behavior and request/response schemas -- that is `openapi.yaml` (5197 lines, authoritative)
- Operational procedures -- that is `OPERATIONS.md`
- Audit log event taxonomy -- that is `docs/audit-log-schema.md`
- Domain IDs, URLs, key cache locations -- those stay in `.claude/rules/` (auto-loaded)

The internals doc should reference these by path rather than repeating their content. Single source of truth, always.

**Document structure recommendation:**

The document should be organized by resource type, not by feature. LLMs and developers reach for this doc when they need to answer "what is binding X?" or "what columns does table Y have?" -- lookup queries, not narrative reading. Flat sections with tables work better than prose for this use case.

Suggested sections:
1. One-paragraph purpose statement
2. D1 schema (tables, columns, types, indexes, constraints)
3. KV namespaces (binding names, key patterns, value shapes, TTLs)
4. R2 buckets (binding names, object key patterns, what gets stored)
5. Queue bindings (names, message shapes, consumer behavior)
6. Environment variables and secrets (name, purpose, where sourced -- not values)
7. Wrangler config summary (environments, routes, compatibility flags)
8. API route map (method + path + handler file -- a quick index, NOT duplicating openapi.yaml's detail)

### Proposed Tasks

1. **Create `docs/INTERNALS.md`** -- Extract the structural reference from source code (wrangler.toml, D1 migrations, src/ route handlers, KV/R2 usage patterns). This is the core deliverable. Derive everything from the actual codebase, not from memory or inference.

2. **Create `.claude/rules/wrl-internals.md`** -- A 2-3 line pointer rule telling Claude Code where to find internals. Example: "For D1 schema, KV namespaces, R2 buckets, API routes, env bindings, and wrangler config, read `docs/INTERNALS.md`." This keeps auto-loaded context minimal while ensuring discoverability.

3. **Add cross-reference to `OPERATIONS.md`** -- Insert a one-line "See also" at the top or in the Environments section pointing to `docs/INTERNALS.md` for binding and schema details.

4. **Verify no content duplication** -- After writing, diff the new doc against `OPERATIONS.md`, `docs/audit-log-schema.md`, and `.claude/rules/*.md` to confirm no information is repeated. Where overlap exists, the new doc should reference the authoritative source by path.

### Risks and Concerns

1. **Staleness risk is the primary concern.** D1 schema changes via migrations, wrangler.toml changes via config updates, KV/R2 patterns evolve with features. The document will rot unless there is a maintenance signal. Mitigations: (a) keep the doc tightly scoped to structural facts derivable from source files, so it can be regenerated; (b) note at the top of the doc which source files it was derived from, so reviewers can spot drift.

2. **Over-documentation temptation.** The Helix Manifesto says "lean and mean." The doc should cover structure (what exists and how it's named), not behavior (what happens when you call an endpoint). Behavior is in the code and openapi.yaml. If the implementer starts writing prose about how the capture pipeline works, they've gone too far.

3. **Context window cost.** If the document grows past 400 lines, LLMs loading it consume significant context. The `.claude/rules/` pointer approach mitigates this -- the full doc is only loaded on demand, not auto-injected. But the doc itself should still be as compact as possible: tables over prose, no examples unless they clarify ambiguity.

4. **Duplication with openapi.yaml.** The API route map section must be a thin index (method, path, one-line purpose, handler file), not a second API spec. If someone adds response schemas or parameter details to INTERNALS.md, it will diverge from openapi.yaml immediately.

### Additional Agents Needed

None. The implementation requires reading source code (wrangler.toml, migrations, src/ files) and writing a single Markdown file. A backend-focused implementation minion can handle this without additional specialist input. The software-docs-minion's contribution is the structural decision (where it lives, what it contains, what it doesn't) -- that work is done in this planning document.
