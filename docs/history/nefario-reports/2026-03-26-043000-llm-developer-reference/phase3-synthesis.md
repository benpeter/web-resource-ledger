# Phase 3: Synthesis -- LLM Developer Reference

## Delegation Plan

**Team name**: llm-developer-reference
**Description**: Create `docs/INTERNALS.md` -- a dense, table-based reference document covering WRL's D1 schema, API routes, KV/R2 patterns, bindings, secrets, queues, and crons -- plus a `.claude/rules/` pointer file for discoverability.

### Decisions

- **Document location: `docs/INTERNALS.md`**
  Chosen: `docs/INTERNALS.md` with a pointer in `.claude/rules/wrl-internals.md`
  Over: Placing the full content in `.claude/rules/` (always-loaded), or using `llms.txt` at repo root
  Why: All five specialists converged on this. Rules files are 4-12 lines each and auto-loaded into every session; a ~250-line reference doc would waste ~2,500 tokens on sessions that never touch schema/routes. The pointer pattern costs ~40 tokens always-loaded and the full doc is loaded on-demand. `llms.txt` is a web-crawler convention, not applicable to internal dev refs.

- **Schema format: hand-written tables, not DDL blocks**
  Chosen: Hand-written current-state tables grouped by domain, with JSON column shapes and app-layer constraints documented
  Over: (a) Raw CREATE TABLE DDL (ux-strategy-minion's suggestion), (b) Auto-generated from migrations
  Why: data-minion made a compelling case that tables can include what DDL cannot: JSON column shapes, app-layer-only constraints (quarantined, tier, billing_status), ID format conventions, and cross-references to R2 keys. ai-modeling-minion corroborated that LLMs parse annotated tables faster than raw SQL. Auto-generation was rejected because ALTER TABLE parsing across 16 migrations is fragile and the maintenance burden of the script exceeds the doc itself.

- **Route table: single flat table with auth, not grouped sub-tables**
  Chosen: One flat route table with columns: Method, Path, Auth, Rate Limit Group, Surface
  Over: Separate tables per domain, or a two-table split (public vs internal)
  Why: api-spec-minion's flat-table approach is the most scannable. Surface column provides the grouping signal without requiring multiple tables. Auth column answers the most common lookup question without reading index.js. OpenAPI coverage column dropped to save tokens -- the doc already points to openapi.yaml.

- **Section ordering: system overview, then bindings, then schema, then routes**
  Chosen: ux-strategy-minion's frequency-of-access ordering
  Over: Alphabetical, or schema-first
  Why: Bindings (`env.SOMETHING`) are the most frequent lookup in code-writing sessions. Schema is second. Routes are third. This ordering matches actual usage patterns.

- **No generation script for MVP**
  Chosen: Hand-written doc with "Last verified" date and source file pointers
  Over: A `scripts/generate-internals.sh` automation
  Why: ai-modeling-minion raised generation as ideal but acknowledged it may be over-engineering for MVP. The schema has 10 tables and changes infrequently (one migration per feature). A generation script that handles ALTER TABLE, CHECK constraints, and JSON column annotations would be more complex than the doc itself. Defer to backlog.

### Task 1: Create document structure and placement

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Document structure and section ordering determine downstream content. Getting the skeleton wrong means reworking all content. This is the only gate in the plan.
- **Gate rationale**:
    Chosen: Frequency-of-access section ordering with mental model scaffold, flat route table, domain-grouped schema tables
    Over: Alphabetical ordering, DDL-based schema, per-domain route sub-tables
    Why: Optimized for LLM random-access lookup patterns per ux-strategy-minion's analysis
- **Prompt**: |
    Create the skeleton for `docs/INTERNALS.md` and the pointer file `.claude/rules/wrl-internals.md` in the WRL repo at `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snuggly-watching-perlis`.

    ## What to produce

    **File 1: `docs/INTERNALS.md`** -- A skeleton with:
    - Title and one-line purpose ("LLM and developer reference for WRL internals")
    - "Last verified" date placeholder
    - Source files list (which files this doc derives from)
    - Section headings in this exact order:
      1. System Overview (~10-15 lines, establishes the mental model: one Worker, one D1, one R2, one KV, three queue pairs, six rate limiters, browser binding)
      2. Bindings (all `env.*` names mapped to type and purpose)
      3. Secrets and Variables (two sub-sections: secrets via `wrangler secret put`, vars from `[vars]`)
      4. D1 Schema (tables grouped by domain: Core, Billing, Auth, Scheduling, Webhooks, Notifications, Threat Intel; include JSON column shapes and app-layer constraints)
      5. API Routes (flat table: Method, Path, Auth type, Rate Limit Group, Surface classification)
      6. KV Key Patterns (key format, value, TTL, purpose, module)
      7. R2 Object Key Patterns (key format, content type, purpose)
      8. Queues (queue name, binding, batch size, retries, DLQ, handler)
      9. Cron Triggers (expression, handler, purpose)
      10. Rate Limiters (binding, limit, purpose)
      11. Staging Differences (only what differs from production -- resource names, env overrides)
    - Each section: H2 heading, one-sentence purpose, then a placeholder table with the right columns
    - Cross-references where appropriate: "For request/response schemas, see `openapi.yaml`", "For operational procedures, see `OPERATIONS.md`", "For audit log events, see `docs/audit-log-schema.md`"

    **File 2: `.claude/rules/wrl-internals.md`** -- A 3-line pointer:
    ```
    For WRL internals (D1 schema, API routes, KV/R2 bindings, secrets, queues, crons),
    read `docs/INTERNALS.md`. Consult it before modifying database queries, adding routes,
    changing env vars, or touching queue/cron configuration.
    ```

    ## Constraints
    - H2 for sections, H3 for subsections. No deeper nesting.
    - No prose explanations of how things work -- this is a lookup document.
    - No duplication of content from openapi.yaml, OPERATIONS.md, or audit-log-schema.md.
    - Tables only (no code blocks for schema). Each table must have the exact columns specified above.
    - The skeleton should make it obvious what content goes where, so the next agent can fill it in without ambiguity.
    - Read these existing docs to understand what NOT to duplicate: `OPERATIONS.md`, `docs/audit-log-schema.md`, `docs/mcp.md`.

    ## What NOT to do
    - Do not fill in the actual data yet (that is a separate task).
    - Do not create any generation scripts.
    - Do not modify CLAUDE.md or any existing rules files.
    - Do not add explanatory prose, tutorials, or "getting started" content.

- **Deliverables**: `docs/INTERNALS.md` skeleton, `.claude/rules/wrl-internals.md` pointer
- **Success criteria**: Both files exist. The skeleton has all 11 sections with correct headings, column headers, and cross-references. The pointer file is 3-5 lines.

### Task 2: Fill in reference content

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Fill in all content for `docs/INTERNALS.md` in the WRL repo at `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snuggly-watching-perlis`. The skeleton from Task 1 is already in place. Your job is to read the actual source files and populate every table with accurate, current data.

    ## Source files to read (in this order)

    1. **`wrangler.toml`** -- All bindings (D1, R2, KV, Queues, Rate Limiters, Browser), vars, environments, cron triggers, queue consumers, compatibility settings. Read both `[env.production]` and `[env.staging]` sections for staging differences.

    2. **`src/index.js`** -- The `routes` array (near the top, ~60 entries) defines all API routes as `[method, regex, handler]`. The `fetch()` handler implements auth dispatch logic: which route prefixes get which auth checks (admin key, session, API key, dual auth, none). Also check for special-case routes handled before the router (MCP, CORS preflight).

    3. **D1 migrations in `migrations/`** -- Read ALL migration files in order (0001 through 0016) and mentally apply them to build the current schema state. Pay attention to: CREATE TABLE, ALTER TABLE ADD COLUMN, DROP TABLE, CREATE INDEX. The final state has 10 active tables (share_tokens was dropped in migration 0013).

    4. **`src/db.js`** -- Contains application-layer constraints (VALID_TIERS, VALID_BILLING_STATUSES), JSON column parsing logic, and the quarantined status virtual mapping (DB stores status='complete' + quarantined=1, API returns status:'quarantined').

    5. **`src/kv.js`** -- KV key patterns for rate limiting.

    6. **`src/oauth.js`** -- KV key patterns for OAuth state and first-key display.

    7. **`src/stripe-webhook.js`** -- KV key pattern for Stripe event idempotency.

    8. **`src/capture.js`** -- R2 object key patterns for screenshots, HTML, headers.

    9. **`src/rate-limits.js`** -- Rate limit group definitions and default limits.

    ## Content rules for each section

    **System Overview**: Under 200 words. State what this Worker is, enumerate what bindings it has (counts: X tables, Y queues, Z rate limiters), and link to other docs for deeper context. No architecture explanation.

    **Bindings**: One table. Columns: Binding Name, Type, Resource, Purpose. Every binding from wrangler.toml. Include D1, R2, KV, Browser, all Queue producers, all Rate Limiters.

    **Secrets**: Table with columns: Name, Purpose. List every secret set via `wrangler secret put`. Do NOT include values. Source: check wrangler.toml comments and the CLAUDE.local.md secrets section for the full list (CAPTURE_API_KEY, SIGNING_KEY, CORALOGIX_SEND_KEY, IP_HASH_SEED, ADMIN_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY).

    **Variables**: Table with columns: Name, Value, Purpose. List all entries from wrangler.toml `[vars]` section.

    **D1 Schema**: For each of the 10 active tables, create a sub-section (H3) with a table showing: Column, Type, Constraints, Notes. Group tables by domain:
    - Core: tenants, captures, api_keys, signing_keys
    - Billing: usage_counters
    - Auth: github_users, sessions
    - Scheduling: schedules
    - Webhooks: webhooks
    - Notifications: notification_preferences, notification_sent
    - Threat Intel: threat_checks

    After the per-table listings, add:
    - A "JSON Columns" table: Table.Column, Shape (one-line description of the JSON structure)
    - An "Application-Layer Constraints" table: Column, Valid Values, Notes (for constraints enforced in db.js, not by D1 CHECK)
    - An "ID Format Conventions" table: Entity, Format, Example

    **API Routes**: One flat table. Columns: Method, Path, Auth, Rate Limit, Surface. Convert regex patterns to readable path templates using `{param}` syntax. Auth values: `api-key`, `admin-key`, `session`, `dual` (session OR api-key), `signature` (Stripe), `none`. Surface values: `public-api`, `admin`, `account`, `auth`, `billing`, `notification`, `ui`, `infra`. Add a note: "For request/response schemas, see `openapi.yaml`." Also document the verify subdomain restriction (verify.webresourceledger.com only serves verification paths).

    **KV Key Patterns**: Table with: Pattern, Value, TTL, Purpose, Module.

    **R2 Object Key Patterns**: Table with: Key Pattern, Content Type, Purpose. Note the distinction between captureId-prefixed artifacts and content-addressed WACZ files.

    **Queues**: Table with: Queue Name, Binding, Max Batch, Max Retries, DLQ, Handler. Cover all three queue pairs (captures, webhooks, emails).

    **Cron Triggers**: Table with: Expression, Handler, Purpose.

    **Rate Limiters**: Table with: Binding, Limit, Purpose. Include the per-tenant override note.

    **Staging Differences**: Only list what differs from production. Typically: database IDs, bucket names, queue names, env var overrides, domain names. Everything not listed is identical.

    ## Token budget
    Target under 3,000 tokens total. This means:
    - No prose paragraphs beyond the System Overview
    - No examples or tutorials
    - No historical context ("added in phase X")
    - Compact table cells (abbreviate where clear)
    - One-sentence purpose intros per section, max

    ## Validation steps (do these after writing)
    1. Count routes in your table and compare against the length of the `routes` array in `src/index.js`. They should match (plus any special-case routes).
    2. Verify all 10 active D1 tables are represented. Confirm share_tokens is NOT listed.
    3. Verify all KV key patterns by grepping for `KV.put` and `KV.get` across src/.
    4. Verify all R2 patterns by grepping for `BUCKET.put` and `BUCKET.get` across src/.
    5. Set the "Last verified" date to today's date.

    ## What NOT to do
    - Do not modify the section structure or ordering from the skeleton.
    - Do not add new sections.
    - Do not include request/response schemas (that is openapi.yaml's job).
    - Do not explain how the capture pipeline works (that is architecture documentation).
    - Do not include secret values.
    - Do not create generation scripts.

- **Deliverables**: Completed `docs/INTERNALS.md` with all sections filled in from source code
- **Success criteria**: All 11 sections populated with accurate data. Route count matches source. All 10 D1 tables documented. All KV and R2 patterns documented. Document is under 3,000 tokens. "Last verified" date is set.

### Task 3: Cross-reference from OPERATIONS.md

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    Add a one-line cross-reference to `OPERATIONS.md` in the WRL repo at `/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/snuggly-watching-perlis` pointing to the new `docs/INTERNALS.md`.

    Read `OPERATIONS.md` first. Find the most natural place for a "See also" line -- likely near the top or in an existing section about environments/bindings. Insert a single line like:

    > For D1 schema, binding names, KV/R2 key patterns, and API route map, see [`docs/INTERNALS.md`](docs/INTERNALS.md).

    Do NOT add content, restructure the document, or duplicate any information from INTERNALS.md. One line only.

- **Deliverables**: Updated `OPERATIONS.md` with cross-reference
- **Success criteria**: One new line added. No other changes to OPERATIONS.md.

### Cross-Cutting Coverage

- **Testing**: Excluded. This task produces only markdown documentation files. No executable code, no configuration changes, no infrastructure modifications.
- **Security**: Excluded. The document lists secret names only, never values. No new attack surface, no auth changes, no user input handling.
- **Usability -- Strategy**: Covered in planning (ux-strategy-minion's contribution shaped section ordering, mental model scaffold, and random-access optimization). No further execution-phase work needed -- the structural decisions are baked into the skeleton.
- **Usability -- Design**: Excluded. No user-facing UI produced.
- **Documentation**: This IS the documentation task. software-docs-minion is the executing agent.
- **Observability**: Excluded. No runtime components produced.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This task produces a single markdown reference document with no UI, no runtime code, no infrastructure, no user-facing output beyond the doc itself.
- **Not selected**:
  - ux-design-minion: No UI components or visual layouts produced.
  - accessibility-minion: No web-facing HTML/UI produced.
  - sitespeed-minion: No web-facing runtime code produced.
  - observability-minion: No runtime components produced.
  - user-docs-minion: The doc is for developers/LLMs, not end users. No user-facing behavior changes.

### Risks and Mitigations

1. **Staleness** (raised by all 5 specialists): The doc will drift from source code over time.
   Mitigation: "Last verified" date at the top. Source file list so reviewers can spot drift. Defer generation script to backlog. Note in the doc which files to check when updating.

2. **Migration consolidation errors** (ai-modeling-minion, data-minion): Manually applying 16 migrations to reconstruct current schema is error-prone.
   Mitigation: The executing agent should validate the consolidated schema against a live D1 instance if accessible (`wrangler d1 execute wrl-metadata-staging --command "SELECT sql FROM sqlite_master WHERE type='table'"`), or at minimum cross-reference against `src/db.js` function signatures.

3. **Route count mismatch** (api-spec-minion): Missing routes is a silent error.
   Mitigation: Validation step in Task 2 -- count routes in doc vs. routes array length in index.js.

4. **Over-documentation / scope creep** (all specialists): Temptation to explain how things work rather than just listing what exists.
   Mitigation: Explicit constraints in the prompt: no prose beyond System Overview, no "how it works" explanations, no historical context. Token budget of 3K acts as a natural ceiling.

5. **KV pattern completeness** (data-minion): KV usage is scattered across 3 modules with no central registry.
   Mitigation: Grep-based validation in Task 2 (search for KV.put/KV.get across all src/ files).

### Execution Order

```
Task 1 (skeleton + pointer) ──> APPROVAL GATE ──> Task 2 (fill content)
                                                  Task 3 (OPERATIONS.md cross-ref, parallel with Task 2)
```

Batch 1: Task 1
Gate: Document structure approval
Batch 2: Task 2 + Task 3 (parallel)

### Verification Steps

After all tasks complete:
1. `docs/INTERNALS.md` exists and is under 3,000 tokens (verify with `wc -w`, roughly 1 token per 0.75 words)
2. `.claude/rules/wrl-internals.md` exists and is 3-5 lines
3. `OPERATIONS.md` has exactly one new line (the cross-reference)
4. Route count in INTERNALS.md matches `routes` array length in `src/index.js`
5. All 10 active D1 tables are documented; `share_tokens` is not
6. No secret values appear anywhere in the document
7. No content duplicated from `openapi.yaml`, `OPERATIONS.md`, or `docs/audit-log-schema.md`
