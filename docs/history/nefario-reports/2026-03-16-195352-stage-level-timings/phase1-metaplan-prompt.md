MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
## Outcome

Each phase of `defaultRenderer()` reports its own duration so that slow stages (session acquisition, navigation, consent, screenshots) can be identified from Coralogix logs and the capture API, replacing the current opaque single `durationMs` number that hides where the 30s `ctx.waitUntil` budget is actually spent. This is motivated by tagesschau.de taking 19.4s and adobe.com failing entirely for pages that load sub-second in a local browser.

## Success criteria

- `render` metadata returned from `defaultRenderer()` includes per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs, settleMs, consentMs, screenshotMs, contentMs)
- Stage timings flow into the KV record and are visible via `GET /v1/captures/:id`
- A structured log event with individual stage durations is emitted to Coralogix on every capture (full and partial)
- All existing tests pass unchanged
- No change to capture behavior or timing (instrumentation only)

## Scope

**In:** `defaultRenderer()` stage timing, `render` metadata shape, structured log event, OpenAPI spec for render object

**Out:** Alerting rules, Coralogix dashboard setup, performance optimization, behavior changes to navigation or consent logic
</github-issue>

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- check the evolution log sequence numbers on upstream main before PR creation and adjust.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/stage-level-timings

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9aXQ3r/stage-level-timings/phase1-metaplan.md
