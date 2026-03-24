# DevX Minion -- Verify Package Changes for Simplified Access Model

## Summary

The `@w-r-l/verify` package has share-token support woven through four layers: a URL-parsing helper, a WACZ fetch function, a 401 error message, and the README. Under the simplified model (128-bit capture IDs as capability tokens, individual captures public), all of this becomes dead weight. The changes are surgical and low-risk, but the error message rewrite deserves care -- it is the most user-visible surface.

---

## (a) `shareTokenFromUrl` -- Remove, Do Not Keep as Dead Code

**Recommendation: Remove entirely.**

Rationale:
- Dead-code-as-defense only makes sense when the dead code might be reactivated soon, or when removing it introduces risk of a subtle regression. Neither applies here. The share token system is being removed at the API level -- there is no scenario where the CLI would need to re-extract tokens.
- Keeping it creates cognitive load for future contributors ("is this still used? should I maintain it?") and contradicts the project's YAGNI/lean-and-mean philosophy.
- The function is 8 lines with no callers after the change. If ever needed again, it is trivial to rewrite from git history.

**Specific changes:**

1. **Delete `shareTokenFromUrl` function** (lines 39-52 of `key-resolver.js`).
2. **Remove its import** from `test/key-resolver.test.js` (line 21).
3. **Delete the entire `describe('shareTokenFromUrl', ...)` test block** (lines 92-110 of `test/key-resolver.test.js`).
4. **Simplify `fetchWaczFromCaptureUrl`** (lines 151-167 of `key-resolver.js`):
   - Remove the `const token = shareTokenFromUrl(captureUrl);` line (154).
   - Remove the `if (token) waczUrl += ...` conditional (157).
   - The function becomes a clean origin + captureId -> artifact URL derivation with no query parameter threading.

---

## (b) 401 Error Message -- Rewrite for Public Access Model

The current 401 handler (lines 104-111 of `key-resolver.js`) says:

```
This capture requires a share token. Use a share URL with ?token=:
  npx @w-r-l/verify "https://wrl.../v1/captures/cap_abc?token=wrl_share_..."

Or verify via the server-side endpoint (no token needed):
  npx @w-r-l/verify "https://wrl.../v1/verify/cap_abc"
```

Under the new model, individual capture GET endpoints are public. A 401 from the capture endpoint should be rare -- it would only happen if the request hits the list endpoint by mistake, or if the server returns 401 for an unrelated reason. But the error message must still be useful.

**Recommended replacement:**

```javascript
if (response.status === 401) {
  throw new Error(
    `HTTP 401 fetching ${url}\n\n` +
    `Individual captures are publicly accessible -- a 401 is unexpected.\n` +
    `Check that the URL is a valid capture URL (e.g., /v1/captures/cap_<id>).\n\n` +
    `If you have a local .wacz file, verify it directly:\n` +
    `  npx @w-r-l/verify capture.wacz --origin https://api.webresourceledger.com`
  );
}
```

This follows the error message design pattern: what went wrong (unexpected 401 on a public endpoint), how to proceed (check URL format, or use local file instead), and an actionable alternative.

**Test update:** The test at line 400-423 of `key-resolver.test.js` asserts `/share token/` in the error message. Update the assertion to match the new message, e.g., `/401.*unexpected/i` or `/publicly accessible/`.

---

## (c) Other References Assuming Authed Capture Access

Beyond `shareTokenFromUrl` and the 401 message, these locations also assume authed access:

### `key-resolver.test.js` -- Token propagation test block (lines 303-423)

The entire `describe('fetchWaczFromCaptureUrl -- token propagation', ...)` block tests two behaviors:
1. **Token forwarded to artifact URL** (line 315-356) -- This test explicitly verifies that `?token=wrl_share_abc123` is appended to the WACZ download URL. With share tokens removed, this test should be **deleted** since the behavior no longer exists.
2. **URL without token constructs clean artifact URL** (line 358-398) -- This test is still valid (verifying that a plain capture URL builds the correct artifact URL). **Keep this test**, but rename the describe block to something like `'fetchWaczFromCaptureUrl -- artifact URL construction'` since "token propagation" is no longer the concern.
3. **401 error message test** (line 400-423) -- Update assertion per (b) above.

### `isWrlCaptureUrl` test cases with `?token=` (lines 57-65)

Two assertions test that URLs with `?token=wrl_share_abc` still match the `isWrlCaptureUrl` pattern. These tests are still valid -- `isWrlCaptureUrl` uses `.test(url.pathname)` which ignores query parameters. The tests confirm that query params don't break the URL matcher. However, the specific `token=wrl_share_*` values are misleading now. **Update the test data** to use a generic query parameter (e.g., `?foo=bar`) so future readers don't think share tokens are still a thing.

### `README.md` -- "Remote capture with share token" section (lines 22-31)

This entire section needs to be rewritten. Under the new model:

```markdown
### Remote capture

```bash
npx @w-r-l/verify "https://api.webresourceledger.com/v1/captures/cap_abc123def456..."
```

The signing key is fetched from the server automatically.
```

The subsequent section about `/v1/verify/` (lines 33-41) should be updated too. With captures being public, the distinction between `/v1/captures/` and `/v1/verify/` changes. If `/v1/verify/` is being kept for server-side verification (different from client-side WACZ download + local verify), clarify that distinction. If it is being removed as part of this simplification, remove this section entirely.

### `README.md` -- `/v1/verify/` confusion

The current README says `/v1/verify/` is "server-side verification" and "does not require a token." With the access model change, this distinction is now confusing because neither requires a token. The README should clearly explain:
- **`/v1/captures/cap_<id>`** = download WACZ and verify locally (this is what the CLI does)
- **`/v1/verify/cap_<id>`** = server-side verification (if this endpoint is retained)

---

## (d) Version Bump

**Yes, bump to 0.3.0 (minor).**

Rationale:
- The current version is 0.2.1.
- This is a backward-compatible change in behavior (removing share token support), but it changes the CLI's error messages and removes a public export (`shareTokenFromUrl`).
- Under semver for 0.x, any minor bump signals "something changed." A patch (0.2.2) understates the scope -- removing a public export is a breaking change for anyone who imported it programmatically.
- Under 0.x conventions, 0.3.0 signals "public API changed" without the weight of a 1.0.0 commitment.

**CHANGELOG entry:**

```markdown
## v0.3.0 (unreleased)

### Changed
- Capture URLs no longer require share tokens -- individual captures are publicly accessible
- Updated 401 error message to reflect public access model
- Renamed `fetchWaczFromCaptureUrl` test suite for clarity

### Removed
- `shareTokenFromUrl` helper (share token system removed from API)
- Share token propagation to artifact download URLs
```

**Do NOT bump version in the same commit as the code changes.** Follow the existing release workflow: code changes in one commit/PR, then `npm version minor` + tag for the actual publish.

---

## Risks and Dependencies

| Risk | Severity | Mitigation |
|------|----------|------------|
| Old CLI versions still send `?token=` param on capture URLs | Low | Server should ignore unknown query params. No action needed in CLI. |
| Someone imports `shareTokenFromUrl` from the package | Low | 0.x semver, minor bump signals API change. Function has no obvious external use case. |
| 401 error message becomes stale if access model changes again | Low | The new message is generic enough to survive further changes. |
| README `/v1/verify/` section becomes confusing | Medium | Must be updated in this same PR -- not deferred. |
| CHANGELOG.md is out of date (lists v0.1.0 but package is 0.2.1) | Low | Not blocking, but the release script should regenerate it. |

## Dependency on Other Work

- The verify package changes should land in the **same PR** as the worker-side access model changes, or immediately after. Publishing a CLI that references share tokens in error messages while the API no longer supports them is worse than publishing a CLI that doesn't mention them while they still exist.
- The `isWrlCaptureUrl` regex accepts both `/v1/captures/` and `/v1/verify/` paths. If the `/v1/verify/` endpoint is being removed in this simplification, update the regex to only match `/v1/captures/`.

## Implementation Checklist

1. `key-resolver.js`: Delete `shareTokenFromUrl` function
2. `key-resolver.js`: Simplify `fetchWaczFromCaptureUrl` (remove token extraction and forwarding)
3. `key-resolver.js`: Rewrite 401 error message in `fetchBytes`
4. `key-resolver.test.js`: Remove `shareTokenFromUrl` import and test block
5. `key-resolver.test.js`: Delete token-propagation test, keep and rename artifact-URL test
6. `key-resolver.test.js`: Update 401 error message assertion
7. `key-resolver.test.js`: Update `isWrlCaptureUrl` test data to remove `wrl_share_*` values
8. `README.md`: Rewrite "Remote capture" section (remove share token references)
9. `README.md`: Clarify `/v1/verify/` vs `/v1/captures/` distinction
10. `package.json`: Bump to 0.3.0 (or defer to release workflow)
11. `CHANGELOG.md`: Add v0.3.0 entry
