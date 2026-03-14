ADVISE

- [ux-strategy]: Both client-side fetches must be fired in parallel, not sequentially -- the prompt should make this explicit.
  SCOPE: Task 1 prompt -- `src/verify-page.js`, the fetch orchestration in the inline script
  CHANGE: Add an explicit instruction to the Task 1 prompt: "Fire both fetches in parallel using Promise.all (or equivalent). Do NOT await them sequentially. Sequential fetches double the perceived loading time and erode trust in a page whose primary job is to quickly convey a verification result."
  WHY: A user's job on this page is "understand whether this content is authentic." Loading state duration is the main friction point before that job is done. If the script awaits the verify fetch, then awaits the retrieval fetch, the total wait time is the sum of both round trips instead of the maximum. On a slow connection this is noticeable. On a trust page -- where a loading spinner that hangs too long triggers "is this broken?" -- the cost is higher than it would be on a utility page. The fix is one line (Promise.all) and should be specified, not left to implementer discretion.
  TASK: 1
