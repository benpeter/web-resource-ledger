# Margo -- Complexity Review

## Verdict: ADVISE

The plan is proportional to the problem. A single-file, ~25-line additive change to fix a real, observed bug (NYT OneTrust iframe loads after `page.frames()` enumeration) is the right scope. The `framenavigated` listener is the simplest Playwright-native mechanism for reacting to late-arriving frames. I have two non-blocking concerns.

---

## Findings

### 1. The `active` flag is YAGNI

**What**: The plan prescribes an `active` boolean flag that `injectIntoFrame` checks before proceeding, to "close the micro-race between Promise.race resolution and `page.off()`."

**Why it appears accidental**: The plan itself acknowledges this is "Low likelihood, Low impact" and that "the worst case is one unnecessary frame injection that has no observable effect." The `page.off()` call in the `finally` block already handles cleanup. The flag adds a second cancellation mechanism for a race whose worst-case outcome is a harmless no-op injection into a frame that is about to be discarded anyway.

**Simpler alternative**: Drop the `active` flag entirely. Register the listener, do the work, call `page.off('framenavigated', injectIntoFrame)` in `finally`. That is sufficient. If a straggler event fires between `Promise.race` resolving and `page.off()` executing, the injection is a no-op (the page is about to be closed). Three fewer lines, one fewer concept for the next reader.

**Severity**: Low. If the implementer includes it, it does no harm -- it is just unnecessary.

### 2. Duplication across `_dismissWithBinding` and `_dismissWithPolling`

**What**: The plan adds the identical listener-registration / dedup-Set / cleanup pattern to both code paths. The two paths differ only in the injection payload (`[autoconsentScript]` vs `wrappedScript`) and the injection call signature.

**Why I am NOT blocking on this**: Extracting a shared helper would be premature -- the two paths have different lifecycle shapes (Promise.race vs polling while-loop), and extracting prematurely would create an abstraction that serves exactly two callers with subtly different needs. That is textbook "extract before the third use case" over-engineering.

**What to watch**: If a third injection-timing concern arises (e.g., frames created by `document.write`, service-worker-injected frames), revisit whether the listener pattern should be extracted. Until then, the duplication is the simpler choice. Noted for the backlog, not for this change.

---

## What the plan gets right

- **Scope discipline**: Two tasks, strict dependency, no technology expansion. The Sourcepoint selector mismatch is correctly identified as a separate concern and deferred to a backlog item rather than bundled in.
- **Additive-only change**: The existing `page.frames()` loop is preserved. The listener is purely additive. This minimizes regression risk.
- **`framenavigated` over `frameattached`**: Correct choice. `frameattached` fires before the frame has a document context, so `evaluate()` would fail. `framenavigated` fires after commit. This is the simplest event that provides what is needed.
- **`Set` over `WeakSet`**: Correct. The frames are already held by the page object. `WeakSet` buys nothing and loses `.size` for debugging. No over-engineering here.
- **No new dependencies, no new services, no new abstractions**: Complexity budget impact is effectively zero.
- **Integration testing via staging validation**: Consistent with the project's "test the real boundaries" philosophy. No mock-heavy unit test theatre.

## Complexity Budget

| Item | Column | Cost |
|------|--------|------|
| New technology | -- | 0 |
| New service | -- | 0 |
| New abstraction layer | -- | 0 |
| New dependency | -- | 0 |
| **Total** | | **0** |

This change adds zero to the complexity budget. It uses existing Playwright APIs in an existing file with an existing pattern.

## Recommendation

Proceed as planned. Consider dropping the `active` flag (finding 1) -- it is the only piece that smells like solving an imaginary problem. If the implementer keeps it, it costs three lines and no real confusion, so I am not blocking on it.
