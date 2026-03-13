# Margo Review: WRL MVP Scoping and Planning

## Verdict: ADVISE

The plan is well-scoped for what was requested. The user asked for four deliverables (scope document, implementation plan, GitHub issues, evolution log), and the plan produces five tasks that map cleanly to those deliverables. The MVP scope itself is disciplined -- the out-of-scope list is longer than the in-scope list, which is exactly right. The serverless-first choice (Cloudflare Workers) eliminates a large class of operational complexity. No YAGNI violations in the scope decisions themselves.

Five concerns, none blocking:

- [simplicity]: Task 2 (technology decisions document) is redundant with the scope document and adds a sequential gate
  SCOPE: Task 2 (docs/evolution/0001-kickoff/decisions.md) and its approval gate
  CHANGE: Merge the 8 technology decisions into the "Technology Stack" and "Gray Zone Decisions" sections of docs/MVP.md. The evolution log decisions.md can be a terse summary pointing to MVP.md, written as part of Task 5 (outcome), not as a separately gated task. This removes one approval gate and one sequential dependency from the critical path.
  WHY: The decisions.md prompt repeats nearly identical content to what Task 1 already documents (bundle format, signing, infrastructure, storage, auth, API design, capture scope, OpenAPI deferral). Two documents covering the same 8 decisions means two places to keep consistent. The approval gate on Task 2 blocks Tasks 3-5 waiting for a review of content that was already approved in Task 1. For a documentation-only phase, two serial approval gates on overlapping content is process overhead without proportional risk reduction.
  TASK: 2

- [simplicity]: Issue 8 (Security Hardening) conflates security concerns already handled in earlier steps with new cross-cutting work
  SCOPE: Implementation Step 8 / GitHub Issue 8
  CHANGE: Move browser isolation constraints (timeout, size limit, subresource cap) into Issue 3 (Capture Endpoint) where they belong -- they are inseparable from the capture implementation. Move RFC 9457 error format into Issue 1 (Scaffold) as a pattern established from the start. Issue 8 then shrinks to: security headers, DNS pinning, global backpressure, and the public key endpoint. This makes each issue more self-contained and avoids a late "hardening" step that retroactively modifies code from Issues 1-6.
  WHY: A trailing "hardening" issue creates a false sense that security is a phase rather than a property. Browser isolation is not something you bolt on after the capture endpoint works -- it is part of making the capture endpoint work correctly. Splitting it out means Issue 3 gets merged without resource limits, creating a window of vulnerability and requiring rework. The same applies to structured errors: establishing the error format in Issue 1 means all subsequent issues follow the pattern naturally rather than retrofitting it.
  TASK: 4

- [simplicity]: The implementation plan specifies 8 granular steps for what is a single Cloudflare Worker file
  SCOPE: Implementation plan (Task 3) and corresponding GitHub issues (Task 4)
  CHANGE: Consider consolidating to 5-6 steps. Specifically: merge Step 5 (Retrieval Endpoint) into Step 3 (Capture Endpoint) since both are route handlers in the same Worker and retrieval is just a KV lookup + R2 fetch (trivial once storage exists). Steps 1-2 could also be a single step (scaffold includes URL validation since the Worker does nothing useful without it).
  WHY: Eight issues for an MVP that is a single Worker with four routes, one static HTML page, and no database risks over-slicing. Each issue carries coordination overhead (dependency tracking, context switching, PR review). The implementation is one JavaScript file with route handlers -- the natural unit of work is larger than one route. This is a mild concern; the current granularity is defensible for agent-delegated work where smaller tasks reduce blast radius.
  TASK: 3, 4

- [simplicity]: The verification page requirement to "work without JavaScript disabled (progressive enhancement)" adds scope
  SCOPE: Issue 7 technical notes, static verification page
  CHANGE: Drop the progressive enhancement requirement. The page calls a JSON API and renders the result -- this is inherently a JavaScript interaction. Server-side rendering would require adding HTML templating to the Worker, which is new complexity for a marginal accessibility gain on a verification tool.
  WHY: Progressive enhancement means the Worker must render a full HTML page with verification results embedded server-side, not just serve a static HTML shell that calls the API. This is a meaningful increase in Worker complexity (HTML templating, duplicating rendering logic) for an edge case (users who disable JavaScript on a verification tool they were specifically sent a link to). YAGNI -- if a no-JS requirement emerges from actual user feedback, add it then.
  TASK: 4

- [simplicity]: The plan specifies detailed rate limit numbers (10/min capture, 60/min verify, 3 concurrent) as MVP requirements
  SCOPE: Rate limiting specification in Task 1 scope and Issue 3/6 technical notes
  CHANGE: Specify rate limiting as a requirement but defer the specific numbers to implementation. Use Cloudflare's built-in rate limiting (configured in wrangler.toml or dashboard) rather than implementing custom rate limiting logic in the Worker code. The specific thresholds are tuning parameters, not architectural decisions.
  WHY: Custom rate limiting in Worker code (tracking per-IP counters in KV, managing sliding windows) is non-trivial implementation work. Cloudflare provides rate limiting as a platform feature. The specific numbers (10/min, 60/min, 3 concurrent) are guesses without traffic data -- they will be tuned post-launch regardless. Implementing rate limiting as application code when the platform provides it is accidental complexity.
  TASK: 4

## Summary

The MVP scope is tight and well-justified. The five-task structure for a documentation phase is proportional. The main optimization opportunities are: (1) reducing process overhead by eliminating the redundant Task 2 approval gate, (2) folding security constraints into the steps where they naturally belong rather than creating a trailing hardening step, and (3) using platform-provided rate limiting instead of implementing it in application code. None of these are blocking -- the plan can execute as-is and produce good results.
