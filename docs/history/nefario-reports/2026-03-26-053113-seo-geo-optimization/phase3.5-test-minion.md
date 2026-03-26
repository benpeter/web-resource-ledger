## Verdict: ADVISE

Task 3's validation audit is well-scoped for a static HTML + Eleventy change set. No unit tests are needed and the cross-cutting note correctly calls this out. However, there are three gaps worth flagging.

---

- [testing]: The Eleventy build step in Task 3 is run once on the output but the docs site build is never run during Task 1 itself before handing off.
  SCOPE: Task 1 — `site/` Eleventy build, `site/_output/`
  CHANGE: Task 1 already includes a build-and-verify step (step 7). Task 3 must not assume that output is fresh — it should re-run `cd site && npx @11ty/eleventy` as its first step rather than treating `_output/` as pre-built, since both tasks run in parallel and `_output/` may not exist at all when Task 3 starts.
  WHY: Task 1 and Task 2 run in parallel (Batch 1). Task 3 is blocked on both, but the plan says Task 3 will "build Eleventy and check" output — this is correct. The risk is that the prompt for Task 3 says "check `site/_output/index.html` for the WebSite JSON-LD block" as if the directory already exists. The agent must build first; if it skips the build step because it finds a stale `_output/` from a prior run, validation becomes unreliable.
  TASK: 3

- [testing]: JSON-LD validation is manual (the agent reads blocks and checks them visually). There is no assertion that FAQPage `@type` question/answer count matches the visible FAQ item count.
  SCOPE: `landing/public/index.html` — FAQPage JSON-LD vs. `<dl class="faq__list">` item count
  CHANGE: Task 3 should explicitly count the number of `<div class="faq__item">` elements in the HTML and assert it equals the number of `mainEntity` entries in the FAQPage JSON-LD block. Eight is the planned count; a copy/paste mistake dropping one question is a real risk the current audit would not catch.
  WHY: Google's FAQPage guidelines require structured data to match visible content. A mismatch between visible questions and JSON-LD entries causes a manual action risk, not just a warning. This is the highest-value testable assertion missing from Task 3.
  TASK: 3

- [testing]: The existing test suite (`npm test` via vitest-pool-workers) is not mentioned anywhere in the execution plan. The cross-cutting section says "Phase 6 will run existing tests" but no task owns triggering that run, and the CLAUDE.local.md instruction is explicit that tests must not be run casually.
  SCOPE: Existing worker test suite — regression risk from any accidental modification to non-landing/non-docs files
  CHANGE: Add an explicit note to the post-execution verification steps that the team lead (not an agent) should confirm no worker source files were touched before deciding whether to run `npm test`. If only files under `landing/public/` and `site/` were modified, the existing test suite provides zero additional signal and should be skipped. Document this decision explicitly so Phase 6 does not trigger an 8 GB test run unnecessarily.
  WHY: The instructions in CLAUDE.local.md are clear that the workerd runtime consumes ~8 GB and must not run without a reason. This change set is pure static HTML and Eleventy templates — no worker code, no D1 schema, no KV logic. Running the suite would be wasteful and risks machine freeze if a subagent triggers it without checking scope first.
  TASK: 3 (post-execution verification)
