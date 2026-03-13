# UX Strategy Review -- WRL MVP Scoping and Planning

**Verdict: ADVISE**

The plan is coherent and well-scoped. The core user journey (submit URL -> poll -> verify) maps cleanly to the three MVP requirements. Two concerns warrant attention before implementation begins.

---

- [ux-strategy]: The "must know the capture ID" constraint eliminates any path to retrieval for users who lose the ID, creating a dead end with no recovery mechanism.
  SCOPE: `docs/MVP.md` -- API surface; specifically the deliberate exclusion of `GET /captures` (list endpoint)
  CHANGE: The out-of-scope table should explicitly document the recovery problem. Either (a) the capture response body must include a permanent, user-accessible record of the capture ID (e.g., a note that the ID must be saved by the caller), or (b) the "no list endpoint" decision should acknowledge that ID loss = permanent loss and document the operator expectation (single-operator MVP, operator retains their own records). The current wording "First addition post-MVP" is a deferral without acknowledging the failure mode.
  WHY: No `GET /captures` and no persistence of IDs creates a situation where a capture is paid for (resource cost incurred) and then becomes unretrievable if the caller loses state. For a single-operator MVP this may be acceptable, but the plan does not state this assumption explicitly. If a developer (or agent) implements Issue 3 without understanding this, the 202 response design may omit critical guidance to callers about preserving the ID. Krug: "Don't make me think" applies to the API consumer too -- the response body should not leave the caller guessing about their recovery options.
  TASK: Task 1 (MVP.md) and Task 4 (Issue 3 -- Capture Endpoint)

- [ux-strategy]: The static verification page (Step 7 / Issue 7) specifies "must work without JavaScript disabled (progressive enhancement)" but the design depends on a JS call to the verify API -- there is no server-rendered fallback described.
  SCOPE: Task 3 (Implementation Plan, Step 7) and Task 4 (Issue 7 -- Static Verification Page)
  CHANGE: Either remove the progressive enhancement requirement (the page is vanilla JS calling a JSON API -- a no-JS fallback would require server-side rendering, which is not in the architecture), or clarify the requirement as "must degrade gracefully" (show the capture ID and a direct link to the verify API JSON endpoint so a no-JS user can still verify via curl). The current wording sets an expectation that cannot be met by the described implementation.
  WHY: A stated acceptance criterion that is structurally impossible to meet will either be ignored (wasted words) or cause an implementer to introduce server-side rendering complexity that contradicts the Cloudflare Workers static-serving architecture. The verification page is the primary UX surface for non-technical third parties -- its requirements need to be precise.
  TASK: Task 3 (Implementation Plan, Step 7) and Task 4 (Issue 7)

---

Both concerns are scoping-document issues, not architectural blockers. They should be resolved before Task 1 and Task 3 are finalized.
