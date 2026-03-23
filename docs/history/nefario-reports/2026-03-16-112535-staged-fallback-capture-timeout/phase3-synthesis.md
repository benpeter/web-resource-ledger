# Advisory Report

**Question**: Should WRL implement a staged fallback strategy that captures whatever rendered before the 25s NAV_TIMEOUT_MS fires, marking the result as partial rather than failing entirely?

**Confidence**: HIGH

**Recommendation**: Yes. Implement the staged fallback. Catch the Playwright TimeoutError, capture screenshot and HTML from the partially-rendered page, skip WACZ bundling on the timeout path, and mark the capture as `status: 'complete'` with `renderQuality: 'partial'`. This is a strict improvement: pages that currently produce zero evidence will produce usable evidence with disclosed limitations.

## Executive Summary

Four specialists -- infrastructure, security, API design, and UX strategy -- independently reached the same conclusion: a partial capture is strictly better than a total failure. The technical foundation is sound: Playwright's page object survives a TimeoutError, screenshot and content extraction work after timeout, and the 30s ctx.waitUntil budget has enough headroom (~1.5-4.5s) for the fallback path if WACZ bundling is skipped. The primary risk is not technical but representational -- a partial capture must never be mistaken for a complete one.

The team converged on a design where `status` remains the lifecycle indicator (pending/complete/failed) and a new `renderQuality` field carries the fidelity signal (full/partial). This separation preserves backward compatibility, keeps the consumer mental model clean, and avoids the significant breakage that a new status value would cause. The quality metadata flows into both the KV record (for API accessibility) and the WACZ datapackage.json (for tamper-evident evidence integrity under the existing Ed25519 signature chain).

The staged fallback is the right immediate response. Cloudflare Queues (R16 in the backlog) remain the right medium-term architecture for eliminating the timeout constraint entirely, but the fallback is valuable even after Queues ship -- some pages never reach networkidle regardless of timeout budget.

## Team Consensus

1. **Partial evidence beats no evidence.** All four specialists agreed without reservation. A screenshot and HTML taken at 25 seconds -- even without lazy-loaded images or tracking pixels -- captures headlines, article text, primary layout, and above-the-fold content. This fulfills the core JTBD (prove what a page looked like) imperfectly rather than not at all.

2. **Keep `status: 'complete'`, add `renderQuality` as a separate dimension.** All specialists rejected a new status value. The lifecycle dimension (is the work done?) and the quality dimension (how good was it?) are orthogonal. A new `partial` or `degraded` status would break existing consumers, create ambiguity about terminal states, and complicate every status check in the codebase.

3. **The 30s ctx.waitUntil limit is hard and not configurable.** iac-minion confirmed this definitively. No plan upgrade, no limit increase request, no runtime configuration can extend it. The 25s NAV_TIMEOUT_MS within the 30s budget is the constraint to design around.

4. **Playwright page survives TimeoutError.** page.screenshot() and page.content() work after a navigation timeout. The error means "the wait condition was not met," not "the page is dead." This is the critical technical assumption and all evidence supports it -- though iac-minion correctly recommends validating with a targeted test on @cloudflare/playwright before production rollout.

5. **Skip WACZ on the timeout path.** The time budget after a 25s timeout is too tight for WACZ bundling (WARC construction, SHA-256 passes, ZIP assembly, Ed25519 signing, R2 upload). Skipping WACZ saves 300-1100ms and keeps the fallback within the 30s wall clock. The screenshot and HTML are the primary evidence artifacts for most use cases.

6. **Queues (R16) remain the right medium-term answer, not a replacement.** All specialists agreed the staged fallback should ship now, with observability instrumented to trigger R16 activation when the 7-day rolling timeout rate crosses 5%.

7. **DOMContentLoaded is the minimum threshold for partial capture.** Pages that never pass DOMContentLoaded should still fail -- a blank screen or spinner is noise, not evidence. The threshold for partial capture is: DOMContentLoaded reached. Below that, fail the capture.

8. **Use factual language, not judgmental.** "Page did not reach network idle within the timeout window" -- not "degraded," "damaged," or "broken." The verification page stays green. Render quality is informational context, not a warning.

## Dissenting Views

1. **retryable on partial captures**: api-design-minion recommends extending `retryable: true` to partial captures, arguing it gives SDK consumers a single check for "a retry may produce a better result." ux-strategy-minion disagrees: partial captures are not failures, and `retryable` should not appear on them -- users who want better quality submit a new capture, which is conceptually distinct from retrying a failure. Resolution: **side with ux-strategy-minion.** The `retryable` field has established semantics tied to failure recovery. Overloading it onto successful captures muddies the distinction. Users can always submit a new capture for the same URL without an explicit `retryable` signal. If data later shows users need this hint on partial captures, it is an additive change.

2. **renderQuality enum values**: api-design-minion proposes `'full' | 'partial'`. ux-strategy-minion initially suggested `'timeout-after-load'` as more descriptive. Resolution: **use `'full' | 'partial'`** per api-design-minion. The enum is a summary signal for filtering and scanning. The descriptive detail lives in the `render` metadata object (waitUntilReached, timedOut, durationMs). Encoding the cause into the enum value couples the quality signal to a specific failure mode, making future extension awkward.

3. **captureQuality vs. renderQuality naming**: security-minion uses `captureQuality` as the metadata object name in datapackage.json; api-design-minion uses `renderQuality` for the API field and `render` for the detail object. Resolution: **no conflict -- these serve different audiences.** The WACZ datapackage.json field can be `captureQuality` (evidence domain, richer structure including domContentLoaded/loadEventFired booleans). The API surface uses `renderQuality` (simpler enum) and `render` (detail object). The implementation computes one internal object and maps it to both output formats. Document the mapping to prevent future confusion.

4. **Whether to gate partial capture on loadEventFired**: security-minion recommends capturing even when only DOMContentLoaded has fired, marking it as "minimal" evidence. ux-strategy-minion agrees (DOMContentLoaded is the floor). api-design-minion proposes only two enum values (full/partial) without distinguishing DOMContentLoaded-only from load-complete. Resolution: **capture at DOMContentLoaded, classify as `renderQuality: 'partial'`**, with the `render.waitUntilReached` field carrying the distinction (domcontentloaded vs. load vs. networkidle). The enum stays simple; the detail object carries nuance. Security-minion's evidence hierarchy (full > degraded > minimal > failed) maps cleanly to this structure without bloating the enum.

## Supporting Evidence

### Infrastructure (iac-minion)

The 30s ctx.waitUntil wall clock is definitively hard. CPU time limits (5 minutes on paid plans) do not help because the capture pipeline is I/O-bound. The realistic time budget after a 25s timeout leaves 1.5-4.5s for post-navigation work. This is workable if WACZ is skipped, but tight. iac-minion recommends explicit deadline tracking (`const deadline = start + 28000`) with short timeouts on post-timeout operations (3s for screenshot, 1s for content extraction). If these also fail, the capture should fail cleanly rather than risk the 30s wall clock.

Cloudflare Queues are a proven pattern with Browser Rendering (official tutorial exists). Queue consumers get 15 minutes wall-clock time, eliminating the timeout constraint for most pages. Queue migration (R16) has a clear activation trigger (timeouts >5%) and should remain a separate planning cycle. The staged fallback is valuable even post-Queues because some pages never reach networkidle regardless of timeout budget (WebSocket connections, polling, streaming analytics).

### Security (security-minion)

The attacker-controlled timeout vector is real but bounded (risk score 6/25, Low-Medium). An attacker controlling a page can deliberately stall loading to force a degraded capture that omits later-loaded content. But today's outcome is worse: the capture fails entirely, giving the attacker a total evidence blackout. A degraded capture is strictly better than no capture from an evidence perspective.

Critical requirement: `captureQuality` metadata must be signed into the WACZ datapackage.json so it falls under the Ed25519 signature. Without this, degraded captures are cryptographically identical to full captures, which is a misrepresentation risk. The signing pipeline needs no changes -- adding fields to datapackage.json automatically includes them in the canonical JSON -> SHA-256 -> Ed25519 chain.

Evidence hierarchy: Full capture (presence and absence claims) > Degraded capture (presence claims only, not suitable for absence claims) > Minimal capture (URL accessible, specific HTML served, weak visual evidence) > Failed capture (no evidence). The staged fallback moves timeouts from tier 4 to tiers 2-3. This is a strict improvement.

The verification endpoint should surface `renderQuality` in its response so that `verified: true` with `renderQuality: 'partial'` is distinguishable from `verified: true` with `renderQuality: 'full'`. Do not add render quality as a verification check -- it is not a cryptographic property.

### API Design (api-design-minion)

All changes are additive and backward compatible. This is a minor version bump (0.2.0 -> 0.3.0), not a breaking change. No status enum values change, no fields are removed or retyped, no URL structures change.

New schema: `RenderInfo` object with `waitUntilReached` (enum: domcontentloaded/load/networkidle), `waitUntilTarget` (currently always networkidle), `timedOut` (boolean), `durationMs` (integer).

Modified schemas: CaptureRecord gains `renderQuality` (required) and `render` (RenderInfo object). CaptureSummary gains `renderQuality` (optional, present when complete). VerificationCapture gains `renderQuality` (optional). KV records default to `renderQuality: 'full'` when the field is absent, preserving backward compatibility for pre-feature records.

Handler impact is minimal: handleGetCapture adds two fields to the response body. handleGetCaptureArtifact needs no change (degraded captures are `complete`, so the status gate passes). handleCaptureStatus needs no change (lifecycle only). handleListCaptures adds renderQuality to the summary projection. handleVerifyCapture adds renderQuality to the capture object.

### UX Strategy (ux-strategy-minion)

The consumer's mental model should remain binary at the top level: the capture worked or it didn't. Render quality is secondary context, not a primary signal. The verification page stays green -- cryptographic integrity is intact. A subtle "Capture note" line appears below the timestamp: "Page did not reach network idle within the timeout window. Some content that loads late (images, widgets) may not be included."

Do not use warning colors (yellow, orange) on the verification page for partial captures. Do not add a separate "Capture Quality" section. The verification page has one job: confirm authenticity. Render quality is context, not a finding.

The staged fallback correctly eliminates futile retries. Today, tagesschau.de fails, user retries, fails again -- the page is inherently heavy and retrying does not fix it. With partial captures, the user gets evidence and decides whether it is sufficient. Recognition beats recall (Nielsen heuristic 6); the user evaluates the screenshot rather than deciding blindly whether to retry.

## Risks and Caveats

1. **Tight time budget after timeout.** The ~1.5-4.5s headroom after a 25s timeout is the thinnest margin in the system. A particularly tall page (MAX_PAGE_HEIGHT = 8000px) could push screenshot time to 2s+, leaving under 1s for R2 uploads and KV writes. Mitigation: explicit deadline tracking, short timeouts on post-navigation operations, and skip WACZ on the timeout path.

2. **@cloudflare/playwright behavior unvalidated.** The assumption that page.screenshot() works after TimeoutError is supported by upstream Playwright semantics and community patterns, but has not been tested on Cloudflare's fork specifically. Mitigation: deploy a targeted test Worker before production rollout.

3. **Consent dialog captures.** A page that loads a cookie consent overlay first and content second will produce a screenshot of the consent dialog. This is honest (the page really showed that) but may not serve the user's intent. Mitigation: the renderQuality metadata lets consumers evaluate fitness for purpose. WRL should not suppress the capture -- the consent dialog screenshot is itself evidence.

4. **Future enum expansion.** If a third `renderQuality` value is added later (e.g., `minimal`), consumers switching on the enum may break. Mitigation: document that consumers should treat unknown renderQuality values as equivalent to `partial` (defensive parsing, standard practice for evolving APIs).

5. **WACZ absence on partial captures.** Skipping WACZ means partial captures lack the tamper-evident evidence bundle. For users who need the WACZ specifically, a partial capture without WACZ may not meet their requirements. Mitigation: this is disclosed via the API (no WACZ artifact URL) and the renderQuality field. Queues (R16) are the path to full WACZ on all captures.

6. **Naming divergence between API and WACZ.** The API uses `renderQuality`/`render` while the WACZ uses `captureQuality`. This could confuse developers working across both surfaces. Mitigation: document the mapping explicitly in the OpenAPI spec description fields.

## Next Steps

If the recommendation is adopted, the implementation path is:

1. **Validate the critical assumption.** Deploy a test Worker that navigates to a known slow page (e.g., tagesschau.de), catches the TimeoutError, and verifies that page.screenshot() and page.content() produce meaningful artifacts on @cloudflare/playwright. This is a prerequisite for everything else and costs minutes to build.

2. **Implement the fallback in capture.js.** Catch TimeoutError from page.goto(), check document.readyState via page.evaluate() (must be at least 'interactive' to indicate DOMContentLoaded), take screenshot and extract content with short timeouts, skip WACZ bundling, track remaining time budget against a 28s deadline.

3. **Add render metadata to the KV record and API surface.** Extend completeCapture() to accept renderQuality and render metadata. Update handleGetCapture, handleListCaptures, and handleVerifyCapture to surface the new fields. Default absent fields to `renderQuality: 'full'` for backward compatibility.

4. **Embed captureQuality in WACZ datapackage.json.** For full captures (when WACZ is still built), add the captureQuality object to datapackage.json so it is covered by the Ed25519 signature. This is a single-line addition to the datapackage object construction.

5. **Update the OpenAPI spec.** Add RenderInfo schema, extend CaptureRecord, CaptureSummary, and VerificationCapture schemas. Bump version to 0.3.0.

6. **Update the verification HTML page.** Add a "Capture note" line for partial captures. Keep the green verified banner. No warning colors.

7. **Instrument observability.** Log timeout rate, degraded capture rate, time budget distribution, and document.readyState at timeout. Track 7-day rolling timeout rate for R16 activation.

8. **Update R16 backlog item.** Note that the staged fallback is implemented and that R16 activation is data-driven (timeouts >5%). Update the R16 description to note that the fallback remains valuable post-Queues for pages that never reach networkidle.

## Conflict Resolutions

1. **retryable on partial captures (api-design-minion vs. ux-strategy-minion)**: Resolved in favor of ux-strategy-minion. Partial captures are successes, not failures. `retryable` has established failure-recovery semantics. Overloading it onto successes muddies the API contract. Users can submit new captures without an explicit signal.

2. **renderQuality enum values (api-design-minion vs. ux-strategy-minion)**: Resolved in favor of api-design-minion. `'full' | 'partial'` is a stable summary signal. Cause-specific values like `'timeout-after-load'` couple the enum to implementation details and make future extension awkward. The detail lives in the `render` metadata object.

3. **captureQuality vs. renderQuality naming (security-minion vs. api-design-minion)**: No real conflict -- these serve different surfaces (WACZ evidence bundle vs. JSON API). Both names are appropriate for their contexts. Documented the mapping to prevent confusion.
