## Security Review Verdict: ADVISE

### Task 1: Skip approaching_limit dispatch (#187)

No security concerns. The race condition is correctly analyzed and properly mitigated: retaining the internal dedup inside `dispatchNotification()` as a correctness guard means the call-site check is additive optimization only. A concurrent bypass of the pre-check results in at most one duplicate notification, caught by the internal guard. No new attack surface.

### Task 2: Descriptive Content-Disposition filenames (#181)

One gap in the sanitization coverage.

---

**SCOPE**: `buildArtifactFilename()` in `src/index.js`, specifically the `date` extraction

**CHANGE**: The `createdAt.slice(0, 10)` date is not sanitized before being interpolated into the `Content-Disposition` header value. The domain is sanitized with an allowlist regex -- the date is not.

**WHY**: `Content-Disposition` header injection requires injecting a newline (`\r\n`) to smuggle additional headers. If a `createdAt` value in D1 contains a newline or carriage return (e.g., due to a corrupt write, migration artifact, or future bug), it would pass through `slice(0, 10)` cleanly on a well-formed ISO string but could be exploited if the field ever contains non-ISO data. The plan asserts "all filenames are ASCII after sanitization" but this is only true for the domain portion -- the date is not sanitized.

**TASK**: After constructing `date = createdAt ? createdAt.slice(0, 10) : ...`, apply the same allowlist sanitization: `date = date.replace(/[^0-9-]/g, '');`. This is one line. A well-formed ISO date (`2026-03-24`) passes through unchanged. Malformed values become a harmless string of digits and hyphens. The fallback catch block already handles URL parse failures, but DB data integrity issues do not throw -- they silently flow through.

The fix:
```js
const rawDate = createdAt ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
const date = rawDate.replace(/[^0-9-]/g, '');
```

Add this to the implementation prompt for Task 2 and verify the test suite includes a case where `createdAt` contains an unexpected value (e.g., `null`, a non-ISO string) to exercise the fallback path.

---

This is advisory, not a blocker. The risk is low given D1 write paths are controlled and the field is set from `new Date().toISOString()` in practice. But the fix is one line and closes the gap entirely.
