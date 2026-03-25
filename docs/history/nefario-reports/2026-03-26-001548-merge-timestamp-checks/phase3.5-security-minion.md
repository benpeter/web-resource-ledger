APPROVE

This is a presentation-layer-only change with no meaningful security surface.

Reviewed:
- `mergeTimestampChecks()` operates on already-parsed internal verifier output, not on external input. No new injection vectors.
- The status priority (fail > pass > skip) correctly prevents any masking of a failing check by a passing one. A failed timestamp cannot be silently upgraded.
- `formatJson()` is explicitly preserved unchanged, protecting downstream consumers that rely on the structured output for their own verification pipelines.
- The `.desc` property set by the merge function is derived from static string constants inside the function, not from user-supplied or network-fetched data. No new XSS surface in verify-page.js.
- `escapeHtml()` is already in place in verify-page.js for rendered output.
- Auth, crypto, and verifier logic are untouched.

No concerns.
