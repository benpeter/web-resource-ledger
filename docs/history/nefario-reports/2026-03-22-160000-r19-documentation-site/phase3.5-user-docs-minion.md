## Review: user-docs-minion

**Verdict: ADVISE**

The plan's content architecture is sound. The sidebar order (Getting Started > Auth > Verification > Batch > MCP > API Reference) follows the Divio framework correctly -- reference last. Getting Started as homepage eliminates a needless wayfinding interstitial. Three-persona auth structure, two-layer verification progressive disclosure, and the "What's next" bottom-of-page nav pattern are all well-specified. The 5-minute criterion is achievable: three curl commands is well under the ceiling.

Two concerns to address before or during content writing:

---

- [documentation]: Node.js 20+ prerequisite listed at page level gates users who only want to capture, not verify
  SCOPE: `site/content/index.md` -- Getting Started prerequisites block
  CHANGE: Move "Node.js 20+ (for the verify step)" out of the page-level prerequisites list and inline it as a callout immediately before Step 3. The page-level prerequisites should only list what is needed to complete Step 1 (API key, curl). Users who stop after Step 2 should not feel blocked by a runtime they don't need.
  WHY: Listing Node.js as a prerequisite at the top is a "prerequisites smell" -- it implies you need it before you start. A user who only wants to run their first capture will see the Node requirement and either abandon or skip the verify step entirely without knowing they could. Scoping it to Step 3 respects the progressive tutorial structure the plan already describes.
  TASK: Task 3 (content writing) -- affects the Getting Started page prompt

- [documentation]: Batch guide defers polling mechanics to API Reference but does not instruct the agent to cross-link there
  SCOPE: `site/content/batch.md` -- polling lifecycle section; Task 3 prompt for the Batch page
  CHANGE: Add one explicit instruction to the Task 3 Batch section: "After collapsing the polling lifecycle, add a cross-link: 'For the full polling lifecycle and status values, see the [API Reference](/api-reference/).'" This closes the loop the prose already opens.
  WHY: The prompt correctly defers polling details to the API Reference to avoid duplication. But without an explicit link, the agent is likely to either omit the cross-link entirely or use a vague "see the API Reference" without a URL. The cross-link strategy needs to be prescriptive for agents, not implied.
  TASK: Task 3 (content writing) -- affects the Batch page prompt section
