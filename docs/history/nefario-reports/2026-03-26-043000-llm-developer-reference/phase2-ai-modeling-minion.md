## Domain Plan Contribution: ai-modeling-minion

### Recommendations

**Placement: `docs/internals.md` -- not `.claude/rules/`**

The existing `.claude/rules/` files are 4-12 lines each and serve as "always loaded" behavioral directives -- things the LLM must know on every request regardless of task (URLs, domain IDs, credential locations). They work precisely because they are tiny and unconditional.

The proposed reference document is fundamentally different: it is a large factual lookup (D1 schema with ~10 tables, 50+ routes, 12+ secrets, 6 queue configurations, 3 cron triggers). Loading all of this into every conversation unconditionally would waste ~2,000-3,000 tokens on sessions that never touch the database or routing layer. That is the wrong tradeoff.

The right placement is `docs/internals.md` -- an on-demand reference that LLMs and developers pull in when they need it. Claude Code agents can read it with a single tool call when they encounter a task involving schema, routes, or bindings. The file is discoverable via a one-line pointer in `.claude/rules/`.

**Add a pointer rule file: `.claude/rules/wrl-internals-ref.md`**

A compact (3-5 line) rules file that tells the LLM where to find the reference:

```
For WRL internals (D1 schema, API routes, bindings, secrets, queues, crons),
read `docs/internals.md`. Always consult it before modifying database queries,
adding routes, changing env vars, or touching queue/cron configuration.
```

This pattern is optimal because:
1. The pointer costs ~40 tokens and is always loaded -- negligible overhead
2. The full reference is loaded only when relevant -- saves ~2,500 tokens on unrelated tasks
3. The LLM knows *where* to look without needing to grep the codebase
4. The document can grow without bloating the always-loaded context budget

**Do NOT use `llms.txt`**

`llms.txt` is a convention for external discovery (placed at website root for crawlers). This is an internal development reference. Using `llms.txt` would be semantically wrong and would not integrate with Claude Code's context loading machinery (CLAUDE.md, `.claude/rules/`).

**Document structure: dense tables over prose**

LLMs parse tables faster and more accurately than prose paragraphs. The document should be structured as:

1. **D1 Schema** -- One table per DB table: column name, type, constraints, notes. Not raw DDL (too verbose and forces the LLM to parse SQL). Not migration-by-migration (forces the LLM to mentally apply diffs). A single consolidated "current state" view.

2. **API Routes** -- Table with columns: Method, Path, Auth, Handler file, Brief description. Grouped by domain (captures, admin, account, webhooks, schedules, billing, auth, notifications, public). Regex patterns simplified to readable path templates (e.g., `/v1/captures/:captureId` not the regex).

3. **Bindings & Environment** -- Table listing each wrangler binding: name, type, resource, notes. Separate section for secrets (name, how to set, what it's for) and vars (name, value/source, purpose).

4. **Queue Architecture** -- Table: queue name, binding, max_batch_size, max_retries, DLQ, max_concurrency, handler function. One row per queue.

5. **Cron Triggers** -- Table: expression, handler, purpose.

6. **KV Key Patterns** -- Table: key prefix/pattern, purpose, TTL.

7. **R2 Object Key Patterns** -- Table: key format, content type, when written.

Each section should have a 1-2 sentence intro and then a table. No filler, no tutorials, no "getting started" framing. This is a lookup document, not a guide.

**Token budget estimate**

Based on the scope:
- D1 schema (10 tables, ~60 columns): ~800 tokens as tables
- API routes (~50 routes): ~600 tokens as a table
- Bindings/secrets/vars (~25 entries): ~400 tokens
- Queues (6 queue pairs): ~200 tokens
- Crons, KV patterns, R2 patterns: ~200 tokens
- Section headers and intros: ~200 tokens

Total: ~2,400 tokens. Well within a single context window read. Under 3K tokens keeps it efficient even if loaded on every call (though the pointer pattern avoids that).

**Maintenance: generation over authoring**

The document should be generated from source files (wrangler.toml, migrations/*.sql, src/index.js route table) rather than hand-authored. A script (`scripts/generate-internals.sh` or similar) can parse these sources and produce the markdown. This prevents drift -- the single biggest risk for reference docs. The generation script itself serves as documentation of where each fact comes from.

Alternatively, if a generation script is too heavy for MVP, include a "Last verified" date at the top and a checklist comment in wrangler.toml / migrations / index.js reminding developers to update `docs/internals.md` when those files change.

### Proposed Tasks

1. **Create consolidated D1 schema view** -- Read all 16 migrations, mentally apply them in order, produce a single "current state" table set. This is the hardest task because migrations may ALTER, DROP, or CREATE tables.

2. **Extract and format API route table** -- Parse the `routes` array in `src/index.js`, map each regex to a readable path template, identify auth requirements from the fetch handler logic, and note the handler file.

3. **Document bindings, secrets, and vars** -- Consolidate from wrangler.toml `[vars]`, secret comments, and binding declarations into a single reference table.

4. **Document queue architecture** -- Extract from wrangler.toml queue producer/consumer blocks.

5. **Document cron triggers and KV/R2 key patterns** -- Extract crons from wrangler.toml, grep for KV key patterns in src/, grep for R2 put/get patterns in src/.

6. **Write `docs/internals.md`** -- Assemble all sections into the final document.

7. **Create `.claude/rules/wrl-internals-ref.md`** -- The compact pointer file.

8. **Evaluate generation script feasibility** -- Decide whether an automated generation approach is worth the investment now or should be deferred to the backlog.

### Risks and Concerns

1. **Staleness is the primary risk.** A reference document that falls out of sync with the code is worse than no reference document -- it actively misleads the LLM. Mitigation: either a generation script or a "last verified" date with explicit review triggers. A CI check that flags `docs/internals.md` for review when wrangler.toml or migrations change would be ideal but may be over-engineering for now.

2. **Migration consolidation errors.** Manually applying 16 migrations to produce a current schema view is error-prone. The implementer should validate the consolidated schema against a live D1 instance (`wrangler d1 execute wrl-metadata-staging --command "SELECT sql FROM sqlite_master WHERE type='table'"`) rather than relying on mental application of migration diffs.

3. **Route table completeness.** The route array in index.js has ~50 entries. Missing a route or mischaracterizing its auth model would be a silent error. Validation: the final route count in the doc should match `routes.length` in index.js.

4. **Over-documentation.** Adding too much detail (full column constraints, exact regex patterns, implementation notes) inflates the token count without proportional value. The document should answer "what exists and where" not "how it works internally." Keep it under 3K tokens.

5. **Token budget creep.** If the document grows beyond ~3K tokens over time, it should be split into domain-specific files (e.g., `docs/internals/schema.md`, `docs/internals/routes.md`) with individual pointer rules. But start with one file -- premature splitting adds navigation overhead.

### Additional Agents Needed

None. This is primarily a data extraction and formatting task. The codebase-minion (or equivalent implementation agent) can read the source files and produce the document. No security, frontend, infrastructure, or MCP expertise is needed.
