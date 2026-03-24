## Verdict: ADVISE

The plan is largely sound. Task 2's scope is correct for the three named files. One file is missing from the update list.

### Gap: `test/security-headers.test.js` not mentioned

Line 36-41 contains a test that will break after Task 1:

```javascript
it('GET /v1/captures/{id} unauthenticated -- 401 response has security headers', async () => {
  // Capture retrieval now requires auth. Unauthenticated request returns 401 (not 404).
  const res = await SELF.fetch('https://worker.test/v1/captures/cap_00000000000000000000000000000000');
  expect(res.status).toBe(401);   // <-- will return 404 after the change (nonexistent capture)
  expectSecurityHeaders(res);
});
```

After Task 1, this endpoint is public and returns 404 for a non-existent capture ID, not 401. The test assertion on `res.status` will fail. The `expectSecurityHeaders(res)` assertion remains valid and should be kept -- just update the expected status to 404 and rename the test.

The plan's Task 2 step 4 says "Search for `share` or `401` in these files and fix any broken assumptions" with security-headers.test.js listed as a target -- so the agent was intended to catch this. But the instruction is soft ("quick scan") and the explicit fix is not called out. With `bypassPermissions` and no approval gate, there is a meaningful risk the agent misses this line and the suite fails at step 5.

### Everything else checks out

- No other test files reference share tokens (confirmed via grep across all test files except the three named).
- `test/cors.test.js` line 152-162 tests 401 on `POST /v1/captures` (not a GET), which stays auth-gated -- no change needed.
- `test/auth.test.js` tests POST /v1/captures or the auth module directly -- no capture GET routes affected.
- `test/scheduled-handler.test.js` has no share token references.
- The fixture cleanup approach (removing `DELETE FROM share_tokens` before the migration drops the table) is correct.
- Task 3 (verify package) and Task 4 (docs) do not affect the worker test suite.
- The two new tests specified (nonexistent capture returns 404, ip field absent from unauthenticated response) are the right additions.

### Recommendation

Add an explicit fix to Task 2's prompt for `test/security-headers.test.js` line 36-41: update expected status from 401 to 404, rename the test description. The "quick scan" instruction as written may not be enough to guarantee the agent catches it.
