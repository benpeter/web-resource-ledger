# Margo Complexity Review -- CMP Navigation Fix

## VERDICT: ADVISE

The change is well-scoped and solves a real problem: the old code blocked all
cross-domain navigation requests (including iframe navigations), which prevented
CMP consent iframes from loading -- a direct blocker for the cookie consent
feature. Narrowing to main-frame only is the correct fix.

**The complexity cost is acceptable.** The route handler gained ~12 lines of
logic (the `page` variable, frame comparison, try/catch). This is justified by
the actual requirement -- CMP libraries like autoconsent embed cross-origin
iframes for consent UI, and blocking those iframes breaks consent dismissal.

### Findings

- [NIT] src/capture.js:376-383 -- The `let isMainFrame = false` / try-catch
  pattern for `route.request().frame() === page.mainFrame()` is correct
  defensive coding, but the comment "frame() throws for pre-creation requests"
  deserves a note about *when* this happens. Pre-creation requests are requests
  that fire before the page object exists (i.e., `page` is null), but that case
  is already handled by the `if (page)` guard on line 377. The try/catch inside
  the `if (page)` block catches a different scenario: frame() throwing on
  detached frames or during page lifecycle transitions. The comment should match
  the actual catch condition.
  FIX: Change comment to `// frame() can throw on detached frames -- treat as non-main-frame`

- [NIT] src/capture.js:64-66 -- The updated "Accepted gaps" comment correctly
  documents the new behavior, but says iframes "can navigate to cross-origin
  destinations" and are "bounded by same-origin policy." These two statements
  are slightly contradictory -- same-origin policy restricts cross-origin
  *access*, not cross-origin *navigation*. The actual bound is MAX_SUBRESOURCES
  (which the comment also mentions). Consider dropping the same-origin policy
  reference to avoid confusion.
  FIX: `*   - Cross-origin iframe sub-navigation: iframes can navigate to cross-origin
  *     destinations (e.g. CMP consent frames); only main-frame cross-origin
  *     navigations are blocked. Bounded by MAX_SUBRESOURCES.`

### Complexity Assessment

| Dimension | Assessment |
|---|---|
| Lines changed | ~15 (route handler) + ~5 (comments) -- minimal |
| New dependencies | 0 |
| New abstraction layers | 0 |
| Cyclomatic complexity delta | +2 (two new branches: `if (page)`, `if (isMainFrame)`) |
| Cognitive complexity delta | +3 (nested conditionals in the route handler) |

The route handler's cognitive complexity is now moderate (nested `if` inside
`if` inside `if` inside an async callback), but it remains a single security
check block with clear intent. Not worth decomposing into a separate function --
that would add indirection without clarity.

### What I checked and found clean

- No new dependencies added
- No YAGNI violations -- this solves a current, blocking problem (CMP iframes)
- No scope creep -- the change is exactly what was needed, nothing more
- No premature optimization
- Header comments updated to match the new behavior
- Security documentation (accepted gaps) honestly updated
- The `page` variable is hoisted before the route handler and assigned after --
  the temporal ordering is correct (route registered before page created, page
  reference available when routes fire during navigation)
