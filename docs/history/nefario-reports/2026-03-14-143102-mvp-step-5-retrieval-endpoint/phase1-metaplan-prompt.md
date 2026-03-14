MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Goal
Complete capture lifecycle — submit, poll, retrieve.

## Context
WACZ bundles are signed and stored in R2, metadata in KV (Step 4 complete). This step adds the retrieval endpoint that closes the lifecycle: a caller can now submit, poll, and retrieve a complete capture.

## Work Items
- [ ] `GET /v1/captures/{id}`: KV lookup returns capture metadata plus artifact links
- [ ] Artifacts served from R2 with correct `Content-Type` and `Content-Length` headers
- [ ] RFC 9457 404 returned for unknown capture IDs
- [ ] Response time target: <300ms from KV read to response
- [ ] Integration smoke test: POST capture -> poll status until complete -> GET capture -> assert metadata fields present and artifact URLs reachable

## Acceptance Criteria
- `GET /v1/captures/{id}` returns capture metadata with artifact URLs for a known capture ID
- `GET /v1/captures/{id}` returns RFC 9457 404 for an unknown capture ID
- Response time is under 300ms (KV read is the bottleneck; no computation should be on the hot path)

## Dependencies
- Blocked by: #4
- Blocks: #6, #7

## Technical Notes
- KV read latency is typically <10ms at the edge — the 300ms target should be comfortable; avoid any synchronous computation in the response path
- Artifact links can be direct R2 public URLs or pre-signed URLs depending on bucket access policy — document the choice
- This is the first endpoint with no authentication — the capture ID acts as the access secret; document this in the response schema
</github-issue>

---
Additional context: use sonnet throughout as the model for agents

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-r7Tpjg/mvp-step-5-retrieval-endpoint/phase1-metaplan.md
