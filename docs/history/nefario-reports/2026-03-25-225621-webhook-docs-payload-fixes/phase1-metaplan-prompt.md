MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

**Outcome**: Webhook documentation accurately reflects the actual API behavior, the `capture.complete` payload includes artifact URLs so consumers can act on webhooks without a follow-up API call, and the ping endpoint response includes signature headers so callers can verify their verification logic end-to-end.

**Success criteria**:
- `capture.complete` webhook payload includes `artifacts` object with screenshot, html, and headers URLs
- Ping endpoint API response includes the signature headers sent to the target (or equivalent fields)
- Docs show `data.captureId` (not `data.id`) matching actual code
- Docs show actual `capture.complete` payload fields: `captureId`, `status`, `url`, `verificationUrl`, `completedAt`, `changeDetection` (optional)
- Docs show actual `capture.failed` payload fields including `verificationUrl`, without `data.createdAt`
- `capture.quarantined` event type is either documented or removed from `VALID_EVENTS`
- `updatedAt` field in list response is documented
- "Exponential backoff" label corrected to match actual schedule description
- All existing webhook tests pass
- New tests cover artifacts in payload and signature echo in ping response

**Scope**:
- In: `webhook-dispatch.js` (payload construction), `webhooks.js` (ping handler), `site/content/webhooks.md`, related tests
- Out: Webhook delivery/retry logic, queue infrastructure, SSRF validation, Stripe webhooks

**Constraints**:
- Artifact URLs must follow existing URL pattern from the docs example (base + `/v1/captures/{id}/artifacts/{type}`)

### Findings from live testing (2026-03-25)

Code changes needed:
1. HIGH: capture.complete payload missing artifacts URLs (screenshot, html, headers) -- Add to buildWebhookPayload()
2. MEDIUM: Ping API response doesn't include signature headers -- Echo signature fields in ping response

Documentation changes needed:
3. HIGH: Docs show data.id; code sends data.captureId -- Update docs examples
4. MEDIUM: capture.quarantined event accepted but undocumented -- Document or remove
5. MEDIUM: changeDetection block in complete payload undocumented -- Document
6. LOW: data.createdAt shown in docs but not sent by code -- Remove from docs
7. LOW: verificationUrl on failed events not shown in docs -- Add to docs
8. LOW: updatedAt in list response not documented -- Add to docs
9. LOW: "Exponential backoff" label inaccurate (schedule is 60/300/900s) -- Fix label
10. LOW: Docs show renderQuality in complete payload; code doesn't send it -- Remove from docs
11. LOW: X-WRL-Delivery header is null on ping requests -- Set to fixed evt_000...000 ID
12. LOW: Ping API response only returns success/httpStatus/latencyMs (covered by #2)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/partitioned-dazzling-hopper

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase1-metaplan.md`
