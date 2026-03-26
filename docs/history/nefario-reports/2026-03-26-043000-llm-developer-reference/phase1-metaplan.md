## Meta-Plan

### Planning Consultations

#### Consultation 1: Document Structure and LLM Discoverability
- **Agent**: ai-modeling-minion
- **Planning question**: What is the optimal format, structure, and placement for an LLM-consumable developer reference document? Should this be an `llms.txt`, a `CLAUDE.md` rules file, a standalone markdown doc in `docs/`, or something else? Consider: how LLMs discover context (CLAUDE.md includes, `.claude/rules/`, `docs/` scans), token budget constraints (the document needs to fit in context windows without truncation), and the separation between "always loaded" reference (rules files) vs "on-demand" reference (docs). The codebase already has `.claude/rules/wrl-domain-ids.md`, `.claude/rules/wrl-urls.md`, and `.claude/rules/wrl-keys-cache.md` as compact reference snippets -- should this new document follow that pattern or take a different approach?
- **Context to provide**: Current `.claude/rules/` files, CLAUDE.md structure, the scope of information to include (D1 schema with 16 migrations, ~50+ API routes, 6+ bindings, 12+ secrets, queue architecture, cron triggers)
- **Why this agent**: This is fundamentally about prompt engineering and LLM context design. The document's primary consumer is LLMs in future development sessions, so its format, density, and discoverability are AI-modeling concerns.

#### Consultation 2: API Surface Extraction Strategy
- **Agent**: api-spec-minion
- **Planning question**: The codebase has both an `openapi.yaml` (public API spec) and internal routes (admin, account, auth, billing, notifications, UI) that are not in the OpenAPI spec. How should the internal reference document represent the full route table vs. the public API surface? Should we extract route information programmatically from `src/index.js` (the routes array is machine-readable), reference the existing `openapi.yaml` for public routes, or document everything in a flat table? What level of detail per route (method, path, auth type, rate limit group) is useful for developer context without duplicating the OpenAPI spec?
- **Context to provide**: `src/index.js` routes array (lines 64-124), `openapi.yaml`, the distinction between public API (captures, verify, signing, webhooks, schedules) and internal routes (admin, account, auth, billing, notifications, UI)
- **Why this agent**: Expertise in API surface documentation, avoiding spec drift, and knowing what level of route detail is useful vs. redundant when an OpenAPI spec already exists.

#### Consultation 3: Data Layer Documentation
- **Agent**: data-minion
- **Planning question**: The D1 schema spans 16 migrations. What is the most maintainable way to document the current schema state in a reference document? Options: (a) a generated "current state" table list extracted from the migrations, (b) a hand-written summary of tables with key columns and relationships, (c) a script that queries `PRAGMA table_info` from a local D1 database. Also: should KV key patterns (the `kv.js` module likely defines key naming conventions) and R2 object key patterns be documented alongside the schema, or separately?
- **Context to provide**: The 16 migration files in `migrations/`, `src/db.js` (the data access layer), `src/kv.js`, wrangler.toml bindings
- **Why this agent**: Database schema documentation and data model representation are core data-minion concerns. They'll know what schema details are load-bearing for developers vs. noise.

### Cross-Cutting Checklist

- **Testing**: No. This task produces a reference document, not executable code or configuration. No tests needed.
- **Security**: No. The document explicitly excludes secret values (names only). However, the executing agent must be careful not to accidentally include secret values from wrangler.toml or `.secrets`. This is a simple instruction, not a planning consultation.
- **Usability -- Strategy**: Include. **Planning question for ux-strategy-minion**: This document serves two distinct user journeys: (1) an LLM starting a development session and needing codebase orientation, and (2) a human developer looking up a binding name or route. Should the document be optimized for sequential reading (narrative) or random access (tables/lists)? Are there information hierarchy decisions (what goes first, what's most frequently needed) that would reduce the "10 minutes of codebase archaeology" the issue describes?
- **Usability -- Design**: No. No UI components or visual interfaces are produced.
- **Documentation**: Include. **Planning question for software-docs-minion**: Where should this document live relative to the existing documentation structure (`docs/`, `.claude/rules/`, `CLAUDE.md` references)? The project already has `docs/mcp.md`, `OPERATIONS.md`, `.claude/rules/` snippets, and the `docs/operations/` directory. What is the right home for a developer reference that is primarily LLM-consumed but also human-readable? Should it cross-reference or replace any existing documentation?
- **Observability**: No. No runtime components are produced.

### Notable Exclusions

- **iac-minion**: The wrangler.toml is being documented, not modified. No infrastructure changes are in scope.
- **security-minion**: The document lists secret names only (not values) and doesn't create new attack surface. A simple "no values" instruction to the executing agent is sufficient.
- **devx-minion**: While this document improves the developer experience, the DX concern here is about content and placement (covered by ai-modeling-minion and ux-strategy-minion), not CLI design or SDK ergonomics.

### Anticipated Approval Gates

1. **Document structure and placement decision** (MUST gate): Before writing the actual content, the document's format (single file vs. split), location (`.claude/rules/` vs. `docs/` vs. root), and scope boundaries need approval. This is hard to reverse (moving a document after it's referenced from CLAUDE.md and habits form) and all content tasks depend on it. This gate consolidates the recommendations from ai-modeling-minion, software-docs-minion, and ux-strategy-minion.

No other gates anticipated. Once structure is decided, the content is largely mechanical extraction from the codebase -- low ambiguity, easy to revise.

### Rationale

This task is primarily about **information architecture for LLM consumption**. The core question is not "what information exists" (it's all in the codebase) but "how to structure and place a reference document so LLMs and developers find it efficiently." Three specialists bring distinct expertise:

- **ai-modeling-minion** understands how LLMs consume context and what document formats work best in AI-assisted development workflows
- **api-spec-minion** knows how to document API surfaces without creating drift against existing specs
- **data-minion** knows how to represent database schemas concisely and what details matter for development context

The cross-cutting consultations (ux-strategy-minion for information hierarchy, software-docs-minion for placement in the docs ecosystem) round out the planning. The actual content extraction is mechanical and can be done by a single agent during execution.

### Scope

**In scope**: Creating a structured reference document covering D1 tables/columns, all API routes with methods, KV/R2 namespace names and purposes, environment variables and secrets (names only), wrangler.toml bindings (queues, rate limiters, browser, cron triggers), and clear separation between public API surface and dev-only internals.

**Out of scope**: Public-facing API documentation (already on docs site via OpenAPI), operational runbooks (already in OPERATIONS.md and ops-runbook skill), architecture narratives (covered by evolution logs), modifying any existing code or configuration.

### External Skill Integration

#### Discovered Skills
| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook` | LEAF | Operational procedures | Not used in planning. May be referenced by executing agent to avoid duplicating operational content. |

#### Precedence Decisions
No precedence conflicts. The ops-runbook skill covers operational procedures (how to do things), while this task produces a structural reference (what exists). No overlap.
