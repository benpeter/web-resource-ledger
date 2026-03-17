## Domain Plan Contribution: test-minion

### Recommendations

**Create `test/consent.test.js` for pure-logic unit tests. Do NOT attempt to mock frame event listeners. Staging validation is the real test for the frame event work. Define a structured 14-site validation protocol with machine-parseable assertions.**

Here is the detailed analysis of each question:

#### (a) Can we unit-test frame event listener registration with a page mock?

**No, and we should not try.** The Phase 0033 decision (#4) correctly identified that mocking Playwright page objects to test consent.js violates the project's "test the real boundaries" philosophy. Adding `page.on('frameattached')` listeners does not change this calculus -- in fact it makes it worse. The value of the frame event listener is its timing relative to the browser's iframe lifecycle. A mock that calls back synchronously or on `nextTick` would prove nothing about whether the listener fires before/after the iframe's document context is ready for `evaluate()`. The mock would test the mock.

Extracting the listener registration into a function like `registerFrameListeners(page, injectFn)` would make the function signature testable but the behavior untestable. The function's correctness depends entirely on when the Playwright runtime fires `frameattached` vs `framenavigated` events relative to the frame's document readiness -- something no mock can replicate faithfully.

**This is a clean case for the existing pattern:** the real test is staging validation against sites that trigger late-loading iframes (NYT/OneTrust).

#### (b) Can the polling loop's behavior with a growing frame array be tested?

**Not meaningfully with mocks, and the scope says not to use polling.** The constraints explicitly state "Use Playwright frame events (frameattached/framenavigated), not polling." The current polling fallback path in `_dismissWithPolling()` already calls `page.frames()` on each iteration, which would naturally pick up late frames. But the constraint asks for event-driven injection, which means the polling path's `page.frames()` call at injection time is the one that misses late frames, and the fix is the same event listener approach used in the binding path.

Even if polling were in scope: mocking a `page.frames()` that returns a different array on the second call tests JavaScript array behavior, not Playwright behavior. Skip this.

#### (c) Should we create consent.test.js?

**Yes. consent.js has testable pure-logic surface area that deserves its own test file.** The file header already references `test/consent.test.js` on line 25. The following logic can and should be unit-tested without any Playwright dependencies:

1. **ALLOWED_MSG_TYPES validation**: Verify the allowlist contains exactly the expected set. This is a regression guard -- if someone adds a type that the switch statement doesn't handle, or removes a type that autoconsent still sends, the test catches it.

2. **Eval code length cap**: The 2048-byte cap on `msg.code` in the eval handler (line 128) is a security-critical invariant. Test that strings over 2048 bytes are truncated. This requires extracting the cap logic or testing it through the message handler.

3. **AUTOCONSENT_CONFIG shape**: Verify the config object matches autoconsent's expected schema (enabled, autoAction, disabledCmps, enablePrehide, detectRetries, enableCosmeticRules). Snapshot test is appropriate here -- the config should rarely change and changes should be deliberate.

4. **Status mapping logic**: The consent result has four status values (dismissed, none, timeout, failed). The mapping from autoconsent message types to these statuses is business logic. Test that:
   - `autoconsentDone` maps to `dismissed`
   - `optOutResult` with `result: false` maps to `failed`
   - `autoconsentError` maps to `failed`
   - Timeout with detectedCmp maps to `timeout`
   - Timeout without detectedCmp maps to `none`

5. **AUTOCONSENT_VERSION export**: Assert the exported version string matches a semver pattern and matches the actual vendored script. This prevents version string drift.

**Implementation approach for consent.test.js**: The pure-logic tests (allowlist, config, version) are straightforward imports. The status mapping tests are harder because the mapping logic is embedded inside the `_dismissWithBinding` and `_dismissWithPolling` closures. Two options:

- **Option A (preferred)**: Extract the status-mapping logic into a small exported helper. Something like `export function resolveConsentStatus(msgType, msgResult, detectedCmp)` that returns the status string. This is genuine function extraction of business logic, not mock-driven architecture astronautics. The function has no Playwright dependency.

- **Option B**: Test the mapping indirectly through the existing capture.test.js fixture pattern, adding consent-aware renderer stubs that return specific consent status values. This tests the orchestration layer's handling of consent statuses but not the mapping from autoconsent messages to statuses.

Option A is better because it tests the actual mapping logic, keeps consent.test.js focused on consent.js's domain, and the extraction is minimal (one pure function, maybe 15 lines).

The eval cap test can use the same approach -- extract `sanitizeEvalCode(code)` as a one-liner that applies the `slice(0, 2048)` with the type check.

#### (d) What assertions should the 14-site staging validation cover?

The 14-site test set covers a good range of CMP providers, geolocations, and consent patterns. Each site should be validated with a structured assertion set:

**Per-site assertions (machine-parseable, not just human eyeball):**

1. **Capture completes** (`status: 'complete'`). A failed capture is a regression regardless of consent outcome.

2. **consentStatus is honest**. For each site, the expected consent outcome should be documented as a baseline:
   - Sites with known CMPs should NOT report `notDetected` (the bug this refinement fixes). Acceptable: `dismissed`, `failed`, `timeout`.
   - Sites without CMPs should report `none` (or `notDetected` -- same thing in the current mapping).
   - `failed` is acceptable as progress (CMP detected, opt-out attempted but did not complete). `dismissed` is the ideal.

3. **consentCmp is populated when consent was attempted**. If status is `dismissed`, `failed`, or `timeout`, the `cmp` field should be non-null and name the CMP provider.

4. **Screenshot artifacts exist**. Both `screenshot.png` and `screenshot-before.png` (when consent was dismissed) should be present. Absence of `screenshot-before.png` when consent status is `dismissed` is a bug.

5. **Render quality is `full`** (not `partial`). A site that falls back to partial capture during consent testing may indicate a timeout regression from the frame event listeners.

6. **consentDurationMs is within budget**. The 8s consent timeout means `consent.durationMs` should be <= 8000ms (or slightly over due to Promise.race resolution timing). A value near 8000 for sites where consent was `dismissed` suggests the dismissal barely made it and is fragile.

**Expected outcomes per site (based on CMP knowledge and Phase 0033 results):**

| Site | Expected CMP | Expected Consent Status | Notes |
|------|-------------|------------------------|-------|
| nytimes.com | OneTrust | dismissed or failed | THE primary regression test -- late-loading iframe was the original bug |
| theguardian.com | Sourcepoint-frame | dismissed or failed | Was `failed` in 0033; improvement expected if Sourcepoint timing fixed |
| spiegel.de | Sourcepoint-frame | dismissed or failed | Same as Guardian |
| lemonde.fr | unknown (likely Didomi or TrustCommander) | dismissed or failed | French sites have strong GDPR CMPs |
| zeit.de | unknown (likely Sourcepoint or consentmanager) | dismissed or failed | German GDPR CMP |
| yahoo.com | unknown | dismissed, failed, or none | US site, CMP may not appear for non-EU IPs |
| sap.com | unknown | dismissed, failed, or none | Corporate site, may use OneTrust |
| microsoft.com | unknown (likely MSCC) | dismissed, failed, or none | Custom CMP, autoconsent may not have rules |
| cnn.com | OneTrust or similar | dismissed, failed, or none | US news site |
| reuters.com | OneTrust or similar | dismissed or failed | International news, likely has CMP |
| stackoverflow.com | unknown | none or dismissed | May not have CMP for Workers' IP geolocation |
| github.com | none expected | none | GitHub does not use a consent banner |
| amazon.de | Amazon-specific | none or failed | Amazon uses custom cookies UI, autoconsent may not have rules |
| bbc.co.uk | none expected | none | BBC does not use a traditional CMP (confirmed in 0033) |

**Staging validation protocol:**

The validation should be scripted, not manual. A shell script or JS script that:

1. Triggers a capture for each of the 14 sites via the staging API
2. Polls for completion (with a generous timeout -- 60s per site given 33s worst-case capture time)
3. Fetches the completed capture record
4. Extracts: `status`, `renderQuality`, `consent.status`, `consent.cmp`, `consent.durationMs`
5. Outputs a TSV/JSON table comparing actual vs expected
6. Exits non-zero if any capture failed to complete (status != 'complete')

This script is reusable for future consent-related changes.

### Proposed Tasks

1. **Create `test/consent.test.js` with pure-logic unit tests** (estimated: 1-2 hours)
   - Export `ALLOWED_MSG_TYPES`, `AUTOCONSENT_CONFIG`, and `AUTOCONSENT_VERSION` (already exported) from consent.js
   - Extract `sanitizeEvalCode(code)` (one-liner: type check + slice) and export it
   - Optionally extract `mapConsentOutcome(msgType, msgResult, detectedCmp)` if the mapping logic can be cleanly separated without restructuring the closures
   - Write tests for: allowlist completeness, eval cap behavior, config shape, version format
   - If status mapping is extracted: test all five status outcomes (dismissed, failed from optOutResult, failed from error, timeout with CMP, none)

2. **Do NOT write frame event listener unit tests** (explicit decision)
   - The listener's correctness depends on Playwright runtime event timing, not on the listener registration call itself
   - A mock `page.on('frameattached', cb)` that synchronously calls `cb` tests nothing real
   - This is consistent with Phase 0033's decision #4 and the project's philosophy

3. **Write staging validation script** (estimated: 1-2 hours)
   - Shell script (bash, no framework dependencies) that captures all 14 sites against staging
   - Outputs structured results (JSON or TSV) with consent status, CMP detected, duration
   - Documents expected outcomes per site as inline comments
   - Lives in `scripts/` or `test/staging/` (follow project convention)
   - Reusable for future consent-related regressions

4. **Document expected consent baselines in the evolution log** (during wrap-up)
   - Record the actual staging results as the new baseline
   - Note which sites improved (notDetected -> dismissed/failed)
   - Note which sites remain at `failed` (Sourcepoint opt-out, autoconsent rule issues)
   - Note which sites are `none` (no CMP or CMP not supported by autoconsent)

### Risks and Concerns

1. **consent.test.js requires minor refactoring of consent.js to export testable units.** The `ALLOWED_MSG_TYPES` Set and `AUTOCONSENT_CONFIG` object are module-level constants that can be exported with zero risk. Extracting `sanitizeEvalCode()` is trivial. Extracting the status mapping is slightly more involved because it's embedded in closures with `resolveConsent()` callbacks, but the logic is pure (input: message type + result + CMP name; output: status string). The risk is that the extraction changes code structure enough to create a merge conflict with the frame event listener changes. **Mitigation:** Do the extraction as a preparatory commit before the frame event listener work.

2. **Staging validation depends on Cloudflare Workers IP geolocation.** Many CMPs only show consent banners to EU users. The staging worker runs on Cloudflare's edge, which may route through a US or non-EU PoP. Sites like yahoo.com, stackoverflow.com, and amazon.de may show different CMP behavior depending on the PoP that serves the request. **Mitigation:** Document the observed geolocation behavior. If consent is `none` for a site known to have a CMP, note "likely geo-filtered" rather than treating it as a failure.

3. **The 14-site test set will take 7-14 minutes to run sequentially** (30-60s per capture). The staging worker may also have session pool limits. **Mitigation:** Run 2-3 captures in parallel (matching the session pool capacity) to reduce total time to ~5 minutes. The validation script should handle this.

4. **No automated regression test for the frame event listener.** The same gap from Phase 0033 persists: the consent injection logic is inside a function that requires a real Playwright browser. The staging validation script provides one-time confidence but not CI regression coverage. This is an accepted trade-off per the project's test philosophy. The backlog item for E2E staging tests (when staging infrastructure supports real Playwright) is the long-term solution.

5. **consent.test.js tests pure logic, not the integration.** The unit tests prove that the allowlist is correct, the eval cap works, and the status mapping is consistent. They do NOT prove that autoconsent messages arrive, that `exposeBinding` works, or that frame injection succeeds. This is by design -- those are integration concerns that require a real browser. But it means consent.test.js gives a false sense of completeness if someone reads only the test count. **Mitigation:** Add a header comment in consent.test.js stating what it tests and what it explicitly does not test.

### Additional Agents Needed

None beyond those already planned. The test-related work (consent.test.js creation, staging validation script) can be done by the implementation agent following the patterns established in `test/capture.test.js` and `test/fixtures.js`. The existing Vitest + `@cloudflare/vitest-pool-workers` config supports the new test file with no infrastructure changes.
