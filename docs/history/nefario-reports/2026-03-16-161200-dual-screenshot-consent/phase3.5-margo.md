# Margo -- Complexity & YAGNI Review

## Verdict: ADVISE

The plan is well-scoped to the actual requirements. Four tasks for a feature that touches the capture pipeline, WARC/WACZ format, KV schema, API layer, and verification UI is proportional -- not inflated. The conflict resolutions (backward-compatible `screenshot` field, no compact rules, cosmetic rules off) are all correct YAGNI calls. Good discipline throughout.

Three concerns worth watching:

---

### 1. `captureSettings.screenshots.before` / `screenshots.after` booleans are redundant (LOW)

The `captureSettings` schema includes a `screenshots` object with `before: true, after: boolean`. These booleans are fully derivable: `before` is always `true` when `captureSettings` exists; `after` equals `consent.result === 'success'`. No consumer needs both a result enum AND a separate boolean pair saying the same thing.

**Recommendation:** Drop the `screenshots` sub-object from `captureSettings`. The `consent.result` field already tells consumers everything they need. If a consumer wants to know whether a before-screenshot exists, they check `artifacts.screenshotBefore`. Adding a parallel boolean representation of the same fact in `captureSettings` creates two sources of truth. Non-blocking -- can be trimmed during implementation.

---

### 2. `captureSettings` metadata WARC record adds marginal value (LOW)

Task 2 Step 1 adds a conditional Record 6 (WARC metadata record for `captureSettings`). This JSON is already in `datapackage.json` and is therefore already signed and bundled in the WACZ. A separate WARC record duplicates it in a second location inside the same archive. The WARC records serve a specific role: preserving the captured web content. `captureSettings` is operational metadata about the capture process, not a web resource.

**Recommendation:** Skip the captureSettings WARC record. Keep it only in `datapackage.json` where it is naturally signed. One canonical location, zero duplication. Non-blocking -- can be deferred to a follow-up if WARC consumers later need it inline.

---

### 3. `page.exposeBinding` risk deserves a concrete fallback, not just a mention (MEDIUM)

Risk 1 identifies that `exposeBinding` might not be available on Cloudflare's Browser Rendering API but says "the polling fallback is documented in the task prompt." It is not. The Task 1 prompt never describes what the polling fallback looks like. If `exposeBinding` is unavailable, the implementing agent will need to improvise under time pressure.

**Recommendation:** Either (a) verify `exposeBinding` availability before execution begins (a 5-minute test), or (b) add 3-4 sentences to the Task 1 prompt describing the polling pattern: inject autoconsent, poll `window.__autoconsentResult` via `page.evaluate()` on an interval, parse the same structured result. This keeps the task self-contained if the happy path fails. This is the only concern I would call action-required before execution.

---

### What the plan gets right

- **Scope matches the issue exactly.** No scope creep -- caller-controlled parameters, cookie injection, viewport parameterization, and compact rules are explicitly out.
- **One new dependency** (`@duckduckgo/autoconsent`), vendored as a single file. Minimal supply chain surface.
- **Backward compatibility** is handled correctly: `screenshot` stays the primary field, `screenshotBefore` is additive.
- **No unnecessary abstraction.** `src/consent.js` is a single module with one export function -- no class hierarchy, no interface, no strategy pattern.
- **Complexity budget is proportional.** One new dependency (1 point), one new module (not a service or layer). Total spend: ~2 points. Reasonable for the feature scope.
- **The compact rules exclusion** (skipping the 932KB JSON) is the right YAGNI call. Built-in detectors cover the major CMPs. Measure detection rates before adding weight.
- **Task 4 (fixture extraction)** is justified -- the duplication across 4 test files is real and the new stubs are needed. This is not premature refactoring.
