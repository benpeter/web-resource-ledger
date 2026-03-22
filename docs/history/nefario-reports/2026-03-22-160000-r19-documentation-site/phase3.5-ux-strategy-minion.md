# UX Strategy Review

**Verdict: ADVISE**

The plan is structurally sound. The conflict resolutions are correct: Getting Started as homepage eliminates a zero-value interstitial, and API Reference last follows the tutorial-before-reference learning model. The five-minute success criterion is specific and testable. Two concerns need addressing before execution.

---

- [usability]: The "What's next" section at the bottom of the Getting Started page is the only wayfinding to other guides, but a user who abandons the tutorial mid-page (e.g., after Step 2) sees nothing that helps them navigate forward.
  SCOPE: Task 3, `site/content/index.md`
  CHANGE: Add a sticky or persistent sidebar that marks the current page as active -- this is already planned in the scaffold (Task 1). Ensure the user-docs-minion is explicitly told that the sidebar handles wayfinding so the "What's next" section only needs to serve users who complete all three steps, not function as the sole navigation safety net. No structural change needed -- this is a framing clarification for the content prompt.
  WHY: Satisficing behavior means users stop at "good enough." A user who gets their first capture working at Step 2 will look left (sidebar) to find what's next, not scroll down to a "What's next" section they haven't reached yet. The sidebar already solves this -- the content prompt should not overload "What's next" with wayfinding responsibility.
  TASK: Task 3

- [usability]: The `max-width: 42rem` constraint for `.docs-content` is specified in Task 1 but the content prompt (Task 3) instructs user-docs-minion to write curl examples and JSON responses that may be substantially longer than 42rem wide. Code blocks that overflow the prose column are a known reading-rhythm disruption -- but if the CSS clips them to the column width without horizontal scroll, users lose content. The Task 1 prompt addresses this for accessibility (`<pre>` with horizontal scroll) but the two tasks don't explicitly agree on how wide code blocks should be allowed to render.
  SCOPE: Task 1 (`site/css/docs.css`) and Task 5 (accessibility audit)
  CHANGE: Task 1's `docs.css` prompt should explicitly state that `.docs-content` `max-width` applies to prose only, and `.code-block` / `pre` elements within it should be allowed to break out of the column constraint (e.g., `max-width: 100vw` with `overflow-x: auto` on a containing block). This prevents the scaffold and content tasks from producing HTML that looks correct individually but clips code examples in practice. Verify this explicitly in Task 5.
  WHY: Code blocks are the primary carrier of value on a developer documentation site. If they're clipped, the Getting Started tutorial fails its 5-minute criterion -- the user sees truncated curl commands and cannot copy correct syntax.
  TASK: Task 1, Task 5

---

**Non-blocking observations** (no change required):

- The `<details>` pattern for the Legacy Single-Key Mode section (Task 3, Auth guide) correctly applies progressive disclosure. Good.
- Three-persona structure for Auth (end user / operator / legacy) correctly maps to three distinct JTBD. The scopes table and endpoint-to-scope matrix together answer both "what do I need?" and "why?" at a glance -- no further intervention needed.
- Sidebar-only navigation (no top nav, no breadcrumbs) is the right call for a 6-page site. Adding breadcrumbs would be a reverse feature (Kano) -- it would actively add noise without orientation value at this scale.
- The copy-to-clipboard button as the sole JS and deferred to Task 5 is correct prioritization. It is an excitement feature (Kano), not a must-be, and treating it as polish-phase is appropriate.
