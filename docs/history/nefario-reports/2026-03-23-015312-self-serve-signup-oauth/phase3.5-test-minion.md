# Test Minion Review: Self-Serve Signup via GitHub OAuth

**Verdict: ADVISE**

The plan is well-structured and executable. Task 8 (test fixtures) is correctly scoped and the injection point for GitHub fetch (`env._githubFetch`) is the right approach for this Worker environment. My concerns are specific and actionable -- none are blockers, but two would cause real test pain in Phase 6 if not addressed now.

---

## Concerns

### 1. SESSION_SECRET fixture value is invalid hex (will break HMAC key import)

**Task 8 prompt specifies:**
```js
SESSION_SECRET: 'a]'.repeat(32), // 64-char hex for test HMAC key
```

`'a]'` is not hex. The `]` character (ASCII 93) is outside `[0-9a-fA-F]`. When `session.js` calls `crypto.subtle.importKey` on this value decoded as hex, the import will fail for every test that exercises session auth.

**The fix** is straightforward -- use `'ab'.repeat(32)` (valid hex, 64 chars) or generate it the same way `testSigningKey` is generated in `vitest.config.js`:
```js
SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
```
or statically:
```js
SESSION_SECRET: 'deadbeef'.repeat(8), // 64-char valid hex
```

Task 8 should be given the corrected value in its prompt. This is the highest-confidence fix needed before execution.

### 2. `createTestSession` must produce a cookie that passes `verifySession` -- the HMAC signing must match session.js exactly

The `createTestSession` fixture will be used in every account endpoint test. If the cookie format or HMAC construction differs from `session.js` even slightly (byte ordering, encoding, key import parameters), all session-authenticated tests will 401.

The plan says `createTestSession` "requires access to `env.SESSION_SECRET` for HMAC signing" -- that's correct. But the prompt does not specify the exact HMAC signing algorithm parameters that `session.js` must use. Before Task 8 executes, Task 3 must be gated first (which it is), so the fixture agent will have `session.js` to read. The Task 8 prompt should explicitly say: **read `src/session.js` and mirror its `createSessionCookie` implementation exactly** -- specifically the HMAC algorithm (`HMAC-SHA256` vs `HMAC-SHA512`), the key import format, and whether the signed payload is `sessionId` bytes or the UTF-8 string.

If this is ambiguous between tasks, the fixture and the implementation will drift. Adding one sentence to the Task 8 prompt eliminates this risk.

### 3. `cleanDb` FK ordering -- sessions must be deleted before github_users

The Task 8 prompt correctly specifies:
1. DELETE FROM sessions
2. DELETE FROM github_users
3. ...existing deletes...

This is right. Just confirming it's in the correct order before the existing `DELETE FROM api_keys` (which deletes tenant-referenced rows). The new tables reference `tenants(id)` transitively through `github_users`, so the proposed order is correct and the test-minion agent executing Task 8 should not reorder them.

### 4. Phase 6 test scope is deferred but the test plan has a gap: ToS enforcement is not integrated-tested at the API layer

The synthesis says:
> "The ToS gate in the UI will block access until accepted." and "The backend enforces via 403 on account endpoints when tosAcceptedAt is null."

But this backend enforcement is only mentioned in the decisions section -- it is not specified in any Task 3 or Task 4 prompt. `handleAccountListKeys`, `handleAccountCreateKey`, etc. do not mention checking `tosAcceptedAt`. If the ToS enforcement is in the backend (as the decisions section implies), it needs to be in the handler or router -- and if it's only in the UI, that's a security gap.

This ambiguity will surface in Phase 6 when the test author tries to write: "account endpoints return 403 when ToS not accepted." They will either find the behavior is already there (and test it), or they will discover it was never implemented. The plan should clarify: **is ToS enforcement a backend gate or a UI gate?** If backend, add it to Task 4 or Task 3 explicitly. If UI-only, document that explicitly so Phase 6 tests don't chase non-existent behavior.

I am not blocking on this because Phase 6 will catch it -- but it's cleaner to resolve the ambiguity now.

### 5. `stubGitHubFetch` needs to handle the GitHub PKCE note

GitHub does not currently support PKCE (`code_challenge`) for OAuth Apps -- only for GitHub Apps. If `handleAuthCallback` sends `code_verifier` in the token exchange and GitHub ignores it (or errors), the stub will need to match the actual behavior. The Task 3 prompt says to send `code_verifier` in the token exchange request.

The `stubGitHubFetch` should accept the `code_verifier` parameter in the POST body without error, matching how GitHub OAuth Apps actually respond (they ignore the field). The prompt is silent on this. Task 8 should explicitly state: the token exchange stub must accept any body fields without validation -- it only checks the URL.

This is low risk if the stub is permissive (accepts any POST body to the token URL), but if it validates fields strictly, tests will fail when `code_verifier` is sent.

---

## What the Plan Gets Right

- The `env._githubFetch` injection pattern is the correct approach for testing fetch calls in a Cloudflare Worker without global fetch mocking. The plan explicitly prohibits `DO NOT mock globalThis.fetch`, which is correct.
- Using `SELF.fetch()` for all HTTP-layer tests (matching the existing `admin-keys.test.js` pattern) is the right call -- tests go through the real router, not hand-crafted request objects.
- The per-IP counter pattern from `admin-keys.test.js` should be carried into OAuth tests to avoid rate limit bleed-over (AUTH_RATE_LIMITER is 10 req/60s). Task 8 does not address this, but the Phase 6 prompt should remind the test agent of this pattern.
- Hash-before-store session IDs mean tests should verify the D1 row has `length(id_hash) = 64` and NOT the raw session value -- this is a meaningful assertion the Phase 6 tests should make.
- Deferred test execution (Phase 6) is appropriate. The fixtures are the right thing to build now; writing tests against unbuilt handlers wastes cycles.

---

## Summary of Requested Actions

1. **Fix `SESSION_SECRET` in the Task 8 prompt** -- change `'a]'.repeat(32)` to a valid 64-char hex string (e.g., `'deadbeef'.repeat(8)` or `crypto.randomBytes(32).toString('hex')`). This is a certain failure if left as-is.

2. **Add one sentence to the Task 8 prompt** -- "Read `src/session.js` and mirror its `createSessionCookie` signing implementation exactly in `createTestSession`."

3. **Clarify ToS backend enforcement** in Task 3 or Task 4 before Phase 6 -- is `tosAcceptedAt IS NULL` checked server-side on account routes, or only client-side?

4. **Make `stubGitHubFetch` token exchange permissive on request body** -- accept any fields in the POST body, validate only the URL.

Items 1 and 2 are required before Task 8 executes. Items 3 and 4 can be addressed in the Phase 6 test writing prompt.
