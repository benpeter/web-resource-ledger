## Meta-Plan

### Task Summary

Three small, independent UI fixes shipped as a single phase (evolution log 0078):

1. **URL auto-prepend** (#179): Add `https://` to bare hostnames in the capture form's `safeUrl()` helper (`src/ui/ui-submit.js`), plus tests.
2. **Verify page text** (#180): Replace "Art." with "Article" in eIDAS reference on the verify page (`src/verify-page.js` line 344). The CLI formatter (`packages/verify/lib/format.js`) has no "Art." references -- no changes needed there.
3. **Billing page spacing** (#183): The `.billing-stat` CSS lacks `display: flex; flex-direction: column` on desktop, so the value `<span>` and label `<span>` render inline without spacing. Fix in `src/ui/ui-css.js` around line 1504.

All three fixes are localized, low-risk, and touch different files with no overlap.

### Planning Consultations

#### Consultation 1: URL normalization UX

- **Agent**: frontend-minion
- **Planning question**: The `safeUrl()` function in `ui-submit.js` currently rejects bare hostnames (no scheme). The fix should auto-prepend `https://` when no scheme is present, but leave `http://` and `https://` URLs untouched, and not "fix" partial schemes like `htt://`. What is the cleanest approach -- modify `safeUrl()` to try prepending before failing, or add a separate `normalizeUrl()` step before `safeUrl()` in `handleSubmit()`? Also: should the input field visually update to show the normalized URL, or should normalization be silent? Consider the existing `url-validation.js` (server-side SSRF boundary) -- the client-side normalization must NOT conflict with server-side validation.
- **Context to provide**: `src/ui/ui-submit.js` (full file, especially `safeUrl()` at line 10-17 and `handleSubmit()` at line 363-433), `src/url-validation.js` (server-side validation for context on what the API expects).
- **Why this agent**: Frontend DOM manipulation expertise and understanding of form UX patterns. The fix is simple but the interaction between client normalization and server validation needs careful thought.

### Cross-Cutting Checklist

- **Testing**: INCLUDE test-minion for planning. The issue explicitly requires "add/update tests for URL prepend logic." The existing test pattern (`evalFromSource` in `test/ui-billing.test.js`) should be followed for extracting and testing the `safeUrl()` function. Test-minion should advise on test cases for the URL normalization (bare hostname, with scheme, partial scheme, edge cases).
- **Security**: EXCLUDE from planning. The URL normalization is client-side convenience only -- the server-side SSRF boundary (`url-validation.js`) is unchanged. No new attack surface is created. The text replacement and CSS fix are inert from a security perspective.
- **Usability -- Strategy**: INCLUDE (mandatory). Planning question: Are there any user journey coherence concerns with auto-prepending `https://`? Specifically: should the user see the normalized URL before submission (input field updates) or should it be silent? What about the error message ("Enter a valid http:// or https:// URL") -- does it need updating if we now auto-fix bare hostnames?
- **Usability -- Design**: EXCLUDE from planning. No new UI components, layouts, or interaction patterns. The fixes are corrections to existing behavior (text content, spacing CSS, input normalization).
- **Documentation**: EXCLUDE from planning. These are small bug fixes. The evolution log (0078) already has `prompt.md`. `decisions.md` and `outcome.md` will be written during/after execution per project rules. No user-facing documentation changes needed.
- **Observability**: EXCLUDE from planning. No runtime components, APIs, or background processes are being modified. These are pure UI presentation fixes.

### Notable Exclusions

- **security-minion**: Client-side `https://` prepend is UX sugar only; the server-side SSRF boundary (`url-validation.js`) remains the trust boundary and is not modified. No new attack surface.
- **accessibility-minion**: The billing CSS fix improves readability (spacing between value and label), but this is a straightforward CSS property addition, not a pattern that needs a11y review. The existing `aria-live` regions and semantic structure are unchanged.
- **software-docs-minion**: Bug fixes with no API surface changes. Evolution log documentation is handled by project rules, not doc-minion planning.

### Anticipated Approval Gates

None. All three fixes are:
- **Easy to reverse** (additive CSS, text replacement, small function modification)
- **Low blast radius** (each fix is self-contained, no downstream dependents)
- **Clear best-practice** (no judgment calls between competing approaches)

This falls squarely in the "NO GATE" quadrant. The only minor judgment call is the URL normalization approach (modify `safeUrl` vs. separate normalizer), which frontend-minion will advise on during planning.

### Rationale

This is a batch of three isolated, low-risk UI fixes. Only one (URL normalization) has any design nuance worth consulting a specialist about. The other two (text replacement, CSS spacing) are mechanical corrections. The planning consultations are deliberately lightweight:

- **frontend-minion** covers the one fix with a design decision (normalization approach).
- **test-minion** advises on test coverage, which the issue explicitly requires.
- **ux-strategy-minion** is included per mandatory checklist to validate the URL normalization UX.

The remaining fixes (text replacement, CSS) need no planning input -- they are direct edits with no ambiguity.

### Scope

- **In scope**: Modifying `safeUrl()` or `handleSubmit()` in `src/ui/ui-submit.js` for URL normalization; replacing "Art. 41" with "Article 41" in `src/verify-page.js` line 344; fixing `.billing-stat` CSS in `src/ui/ui-css.js` for proper vertical layout; adding tests for URL normalization.
- **Out of scope**: Server-side URL normalization (`url-validation.js`, `capture.js`), i18n infrastructure, billing logic changes, privacy page "Art." references (those are correct GDPR citations), `ip-hash.js` comment (internal documentation, not user-facing).

### External Skill Integration

No external skills detected in project.
