## Domain Plan Contribution: ux-strategy-minion

### Recommendations

**The core question: narrative vs. random access?**

Random access. Unambiguously. Here is why.

Both user journeys -- LLM orientation and human lookup -- are random-access tasks. Neither consumer reads this document start-to-finish for comprehension. The LLM needs to rapidly locate specific facts (what is the DB binding name? what routes exist? what secrets are required?) to ground its responses. The human developer needs the same facts for the same reason. Narrative prose would force both consumers to parse paragraphs to extract atomic facts, which is pure extraneous cognitive load.

However, "random access" does not mean "dump everything in one flat list." The document needs two structural properties that tables alone do not provide:

1. **A mental model scaffold at the top** -- a short (10-15 line) section that establishes the system shape: "one Worker, one D1 database, one R2 bucket, one KV namespace, three queue pairs, six rate limiters, headless browser binding." This gives both LLMs and humans the gestalt before they dive into specifics. Without this, readers don't know what categories of information to expect, so they can't efficiently skip to what they need. This is the only "narrative" the document needs, and it should be under 200 words.

2. **Consistent, scannable sections with tables** -- each section (D1, API routes, KV, R2, queues, rate limiters, env vars/secrets, cron triggers) follows an identical structure: one-sentence purpose statement, then a table. No paragraphs of explanation. No prose that restates what the table already shows.

**Information hierarchy: what goes first**

The "10 minutes of codebase archaeology" problem has a specific shape. When an LLM starts a WRL session, the questions come in a predictable priority order:

1. **System shape** (the mental model scaffold) -- what am I looking at?
2. **Bindings and env vars** -- what names do I use in code? This is the most frequent lookup because every code change touches `env.SOMETHING`.
3. **D1 schema** -- what tables/columns exist? Second most frequent because most features involve database queries.
4. **API routes** -- what endpoints exist and what auth do they require? Needed when adding or modifying endpoints.
5. **Queue architecture** -- how does async processing work? Needed less frequently, only when touching capture pipeline or webhooks.
6. **Rate limiters** -- what limits exist? Rarely needed except when adding new rate-limited endpoints.
7. **Staging differences** -- how does staging diverge from production? Only needed during deployment or environment-specific debugging.

This ordering follows the frequency-of-access principle: put the most-looked-up information closest to the top. It also follows progressive disclosure -- you don't need to understand queue architecture to make a database change.

**Specific structural recommendations:**

- **Bindings summary table first** after the system overview. A single table mapping every `env.*` binding to its type (D1, KV, R2, Queue, RateLimit, Browser) and purpose. This is the single highest-value artifact in the document -- it answers the question "what is `env.CAPTURE_QUEUE`?" without requiring the reader to search through wrangler.toml.
- **Secrets table separate from vars table.** Secrets (set via `wrangler secret put`) and vars (in wrangler.toml `[vars]`) have fundamentally different operational characteristics. Mixing them creates confusion about what is checked in vs. what must be provisioned.
- **Route table should include auth method.** Each route should show method, path pattern, auth requirement (API key, admin key, session, unauthenticated), and source file. This eliminates the need to read index.js to understand route-level auth.
- **D1 schema as CREATE TABLE statements, not prose.** LLMs parse SQL faster than English descriptions of tables. Include the current schema as a consolidated DDL block (derived from applying all migrations in order), not as a list of migration files. Migration files tell you history; the reference document should tell you current state.
- **No staging duplication.** Don't repeat the entire structure for staging. Instead, have one "Staging Differences" section at the bottom that lists only what differs (database IDs, bucket names, queue names, rate limiter namespace IDs, env var overrides). Everything not listed is identical.

**Anti-patterns to avoid:**

- **Don't include "how it works" explanations.** This is a reference document, not an architecture guide. "The capture pipeline works by..." belongs in architecture docs. The reference doc says: "CAPTURE_QUEUE binding, queue name wrl-captures, max_batch_size 1, DLQ: wrl-captures-dlq."
- **Don't duplicate wrangler.toml verbatim.** The document should be a curated, scannable extraction of the facts in wrangler.toml, not a copy of it. If someone wants the raw config, they read wrangler.toml. The reference doc adds value by organizing, cross-referencing, and annotating.
- **Don't include historical context.** No "this was added in phase 0016" or "previously we used X." Reference documents describe current state only.
- **Don't use deeply nested headings.** Two levels maximum (H2 for sections, H3 for subsections). Deep nesting creates navigation friction in both LLM context windows and human scanning.

### Proposed Tasks

1. **Define the document skeleton.** Write the heading structure and one-sentence purpose for each section, following the hierarchy above. Validate that the section order matches access frequency before filling in content. (This is a UX-strategy-informed constraint for whoever writes the actual content.)

2. **Create a consolidated bindings summary table.** Extract from wrangler.toml: binding name, type, underlying resource name, and one-line purpose. This single table is the highest-ROI artifact.

3. **Generate consolidated current-state DDL.** Apply all 16 migrations in order and produce a single CREATE TABLE block representing current schema. Do not list migrations individually.

4. **Build the route table with auth annotations.** Extract from index.js routes array. Columns: Method, Path, Auth (apiKey/adminKey/session/none), Handler file. Group by domain (captures, admin, account, webhooks, schedules, notifications, billing, auth, system).

5. **Write the secrets vs. vars table.** Two separate tables. Secrets table: variable name, how to provision (`wrangler secret put`), purpose. Vars table: variable name, value (or "env-specific"), purpose.

6. **Write the staging differences section.** Only list divergences from production -- different database IDs, bucket names, queue names, etc. Everything unlisted is identical.

7. **Write the system overview paragraph.** Under 200 words. Establishes the mental model: what this Worker is, what bindings it has, what it does. No architecture deep-dive.

8. **Validate the document against the "fresh session" test.** An LLM agent (or a human unfamiliar with the codebase) should be able to answer these questions by scanning the document in under 30 seconds each: (a) What is the D1 binding name? (b) What auth does POST /v1/captures require? (c) What secrets must be provisioned for a new environment? (d) What queue handles webhook delivery? If any of these require more than a quick table scan, the structure needs adjustment.

### Risks and Concerns

1. **Staleness is the primary risk.** Reference documents that fall out of sync with the code are worse than no document -- they create false confidence. The document must be positioned near the source of truth (in-repo, not in an external wiki) and ideally generated or validated by a script that checks wrangler.toml and migration files. Consider adding a comment at the top: "Last validated against wrangler.toml and migrations/ on YYYY-MM-DD."

2. **Scope creep into architecture documentation.** The temptation will be strong to explain *why* things are configured a certain way. Every "why" sentence is a maintenance burden and a staleness vector. The reference doc should link to architecture docs for context, not contain it.

3. **Over-serving the human consumer at the expense of the LLM consumer.** Humans prefer visual formatting (bold, color, spacing). LLMs prefer dense, unambiguous, machine-parseable structure (tables, consistent formatting, no decorative text). Since LLMs are the primary consumer, optimize for parseability. Tables with consistent column structure. No decorative prose. No "Note:" callouts that break table scanning.

4. **Forgetting to include the route-to-auth mapping.** Based on the codebase, auth logic is split across verifyAuth, verifyApiKey, verifyAdminKey, and verifySession, with different routes using different auth methods. If the route table omits auth requirements, LLMs will still need to read index.js to figure out which auth a new endpoint should use -- defeating the purpose.

### Additional Agents Needed

None. The content extraction is straightforward code-reading work suitable for the implementation agent. The information architecture decisions are covered here. No visual design, accessibility, or specialized domain expertise is needed beyond what the existing agent team provides.
