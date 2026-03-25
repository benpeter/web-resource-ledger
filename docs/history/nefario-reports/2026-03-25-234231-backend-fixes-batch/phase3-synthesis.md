## Delegation Plan

**Team name**: backend-fixes-batch
**Description**: Two small backend fixes -- skip redundant D1 queries for approaching_limit notifications (#187), and add descriptive Content-Disposition filenames to artifact downloads (#181).

### Task 1: Skip approaching_limit dispatch when already sent (#187)
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Short-circuit approaching_limit notification dispatch (#187)

    ### Problem

    Free-tier tenants get an `approaching_limit` notification when their capture count
    hits 80% of the monthly limit. Currently, every capture from count 161-200 calls
    `dispatchNotification()`, which internally runs 2 D1 queries (load prefs + check dedup)
    before discovering the notification was already sent. That is ~40 wasted round-trips
    per tenant per month.

    ### What to do

    Add a call-site pre-check in `src/index.js` using the existing `checkNotificationSent()`
    function from `src/db.js`. This is a 1-query short-circuit that avoids entering
    `dispatchNotification()` entirely when the notification was already sent this period.

    **DO NOT remove the internal dedup inside `dispatchNotification()`.** It is a correctness
    guard against race conditions. The call-site check is purely a performance optimization.

    ### Implementation steps

    **Step 1: Add import**

    In `src/index.js` line 4, add `checkNotificationSent` to the existing `db.js` import:

    ```js
    import { createCapture, getCapture, failCapture, listCaptures, listArchivedSigningKeys, TENANT_ID_RE, SCHEDULE_ID_RE, getTenantConfig, setTenantConfig, incrementUsage, setCaptureThreatCheck, getPreviousCaptureId, setChangeSummary, checkNotificationSent } from './db.js';
    ```

    **Step 2: Add short-circuit in the queue consumer**

    In `src/index.js`, the approaching_limit block is at lines 306-328. Currently lines 313-322
    look like:

    ```js
    if (newCount >= threshold) {
      const baseUrl = env.VERIFICATION_BASE_URL
        ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
        : 'https://api.webresourceledger.com';
      await dispatchNotification(env, tenantId, 'approaching_limit', {
        used: newCount,
        limit: FREE_CAPTURE_LIMIT,
        period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        addPaymentUrl: `${baseUrl}/v1/billing/checkout`,
      }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
    }
    ```

    Insert a dedup check after `if (newCount >= threshold) {` and before the `dispatchNotification` call:

    ```js
    if (newCount >= threshold) {
      // Short-circuit: skip dispatchNotification if already sent this period (#187)
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const alreadySent = await checkNotificationSent(env.DB, tenantId, period, 'approaching_limit');
      if (alreadySent) {
        log(env, 3, 'email', { event: 'email.approaching_limit_skipped', tenantId, reason: 'already_sent', period });
      } else {
        const baseUrl = env.VERIFICATION_BASE_URL
          ? env.VERIFICATION_BASE_URL.replace(/\/$/, '')
          : 'https://api.webresourceledger.com';
        await dispatchNotification(env, tenantId, 'approaching_limit', {
          used: newCount,
          limit: FREE_CAPTURE_LIMIT,
          period: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          addPaymentUrl: `${baseUrl}/v1/billing/checkout`,
        }).catch(err => log(env, 4, 'email', { event: 'email.dispatch_error', error: err?.message, tenantId }));
      }
    }
    ```

    Note: The period format `YYYY-MM` matches exactly what `dispatchNotification()` uses
    internally (see `src/email-dispatch.js` line 193). This is critical for the dedup
    check to work correctly.

    ### Tests

    Add tests in `test/notification-triggers.test.js` in the existing `3b` describe block.
    The test file already has helpers: `seedNotificationPrefs`, `makeEmailEnv`, `seedUsage`,
    and imports `checkNotificationSent` can be added from `../src/db.js`.

    Add these test cases:

    1. **"approaching_limit short-circuit skips dispatchNotification when already sent"** --
       Seed notification prefs, seed usage at 80% threshold, mark notification as already sent
       in `notification_sent` table using `markNotificationSent()`, then run a capture through
       the queue consumer. Verify `dispatchNotification` is NOT called (spy or check that no
       messages are enqueued to EMAIL_QUEUE).

    2. **"approaching_limit dispatches on first crossing even with short-circuit"** --
       Seed notification prefs, seed usage at 80% threshold, do NOT mark as sent. Run capture
       through queue consumer. Verify notification IS dispatched.

    Use the existing test patterns: `runConsumer()` with `makeCaptureMsg()` for full queue
    consumer tests, or direct `dispatchNotification()` calls for unit-level checks.
    Import `markNotificationSent` from `../src/db.js` for seeding the dedup state.

    ### Boundaries

    - Only modify `src/index.js` (import + queue consumer block)
    - Only add tests in `test/notification-triggers.test.js`
    - Do NOT modify `src/email-dispatch.js` or `src/db.js`
    - Do NOT extract a period helper into a separate module (the inline computation is 1 line)
    - Run `npx vitest run test/notification-triggers.test.js` to verify your new tests pass
    - Run `npx vitest run` to verify no existing tests break

- **Deliverables**: Modified `src/index.js` with dedup short-circuit, new test cases in `test/notification-triggers.test.js`
- **Success criteria**: (1) When `notification_sent` already has a row for the current period + `approaching_limit`, `dispatchNotification()` is not called. (2) When no row exists, behavior is unchanged. (3) All existing tests pass. (4) New tests cover both paths.

### Task 2: Descriptive Content-Disposition filenames (#181)
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Descriptive Content-Disposition filenames for artifact downloads (#181)

    ### Problem

    Artifact download responses currently use generic filenames (`screenshot.png`,
    `bundle.wacz`, etc.) in the `Content-Disposition` header. Users downloading multiple
    captures get identically-named files. Include the captured domain and date for
    descriptive filenames like `capture-example.com-2026-03-24.wacz`.

    ### What to do

    Modify `handleGetCaptureArtifact()` in `src/index.js` to build descriptive filenames
    using data from the `record` object (which is already fetched from D1 via `getCapture()`).

    ### Implementation steps

    **Step 1: Add a filename builder function**

    Add this function in `src/index.js`, placed just before `handleGetCaptureArtifact`
    (around line 1720):

    ```js
    /**
     * Build a descriptive filename for artifact downloads.
     * Pattern: capture-{domain}-{date}.{ext}
     * Falls back to generic names if URL parsing fails.
     */
    function buildArtifactFilename(url, createdAt, artifactName) {
      const extensions = {
        'screenshot-before': 'png',
        screenshot: 'png',
        html: 'html',
        headers: 'json',
        wacz: 'wacz',
      };

      const fallbacks = {
        'screenshot-before': 'screenshot-before.png',
        screenshot: 'screenshot.png',
        html: 'rendered.html',
        headers: 'headers.json',
        wacz: 'bundle.wacz',
      };

      try {
        let domain = new URL(url).hostname;
        // Strip www. prefix
        domain = domain.replace(/^www\./, '');
        // Sanitize: keep only a-z, 0-9, dot, hyphen
        domain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
        // Truncate to 100 chars
        if (domain.length > 100) domain = domain.slice(0, 100);

        // Date from createdAt (ISO string) -> YYYY-MM-DD
        const date = createdAt ? createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

        const ext = extensions[artifactName];
        const suffix = artifactName === 'screenshot-before' ? '-before' : '';
        return `capture-${domain}-${date}${suffix}.${ext}`;
      } catch {
        return fallbacks[artifactName] || `${artifactName}.bin`;
      }
    }
    ```

    **Step 2: Wire it into handleGetCaptureArtifact**

    In `handleGetCaptureArtifact()`, the current code at lines 1791-1805 is:

    ```js
    const filenames = {
      'screenshot-before': 'screenshot-before.png',
      screenshot: 'screenshot.png',
      html:       'rendered.html',
      headers:    'headers.json',
      wacz:       'bundle.wacz',
    };

    const buffer = await obj.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentTypes[artifactName],
        'Content-Disposition': `attachment; filename="${filenames[artifactName]}"`,
    ```

    Replace the `filenames` map and its usage with:

    ```js
    const filename = buildArtifactFilename(record.url, record.createdAt, artifactName);

    const buffer = await obj.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentTypes[artifactName],
        'Content-Disposition': `attachment; filename="${filename}"`,
    ```

    The `record` object is already available -- it's fetched at line 1738:
    `const record = await getCapture(env.DB, captureId);`

    The record shape includes `url` (string) and `createdAt` (ISO 8601 string),
    both populated by `rowToCapture()` in `src/db.js`.

    ### Tests

    Add tests in `test/capture-retrieval.test.js`. This file already seeds captures with
    `createCapture(env.DB, CAP_A, 'https://example.com', ...)` and R2 artifacts, and
    fetches them via `SELF.fetch()`.

    Add a new describe block:

    ```js
    describe('GET /v1/captures/{id}/artifacts/{name} -- Content-Disposition filenames', () => {
      it('screenshot filename includes domain and date', async () => {
        const res = await SELF.fetch(
          `https://worker.test/v1/captures/${CAP_A}/artifacts/screenshot`,
        );
        expect(res.status).toBe(200);
        const cd = res.headers.get('Content-Disposition');
        // Domain from 'https://example.com' -> 'example.com'
        expect(cd).toContain('example.com');
        // Should be attachment with .png extension
        expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.png"$/);
      });

      it('wacz filename includes domain and date', async () => {
        const res = await SELF.fetch(
          `https://worker.test/v1/captures/${CAP_A}/artifacts/wacz`,
        );
        expect(res.status).toBe(200);
        const cd = res.headers.get('Content-Disposition');
        expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.wacz"$/);
      });

      it('html filename includes domain and date', async () => {
        const res = await SELF.fetch(
          `https://worker.test/v1/captures/${CAP_A}/artifacts/html`,
        );
        expect(res.status).toBe(200);
        const cd = res.headers.get('Content-Disposition');
        expect(cd).toMatch(/^attachment; filename="capture-example\.com-\d{4}-\d{2}-\d{2}\.html"$/);
      });
    });
    ```

    Also add unit tests for `buildArtifactFilename` directly. Since it is not exported,
    test it indirectly through the HTTP response (as above), OR export it for testing.
    Prefer the indirect approach -- the HTTP-level tests verify the complete behavior.
    If you want additional edge-case coverage (www stripping, IDN, long domains, bad URLs),
    export the function and add a small unit test block. Use your judgment -- the HTTP tests
    are the minimum requirement.

    ### Boundaries

    - Only modify `src/index.js` (add function + update handler)
    - Only add tests in `test/capture-retrieval.test.js`
    - Do NOT modify `src/db.js` or any other source file
    - Do NOT add `filename*` (RFC 5987 UTF-8 encoding) -- all filenames are ASCII after sanitization
    - Run `npx vitest run test/capture-retrieval.test.js` to verify your new tests pass
    - Run `npx vitest run` to verify no existing tests break

- **Deliverables**: Modified `src/index.js` with `buildArtifactFilename()` function and updated handler, new test cases in `test/capture-retrieval.test.js`
- **Success criteria**: (1) Artifact downloads include domain and date in filename. (2) `www.` is stripped. (3) Non-ASCII chars are sanitized. (4) Malformed URLs fall back to generic filenames. (5) All existing tests pass. (6) New tests cover happy path and at least screenshot + wacz artifacts.

### Cross-Cutting Coverage

- **Testing**: Covered within each task -- both tasks include specific test requirements with file paths and patterns.
- **Security**: Not applicable. No new attack surface, no auth changes, no user input handling changes. The filename sanitization in Task 2 prevents header injection by design (ASCII-only, no quotes/newlines).
- **Usability -- Strategy**: Not applicable. These are backend optimizations with no user journey changes. The filename improvement (Task 2) is a minor DX improvement for users downloading artifacts -- straightforward and self-evident.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: Not applicable. No public API contract changes (Content-Disposition filenames are browser hints, not API surface). No architecture changes.
- **Observability**: Not applicable. No new runtime components. Task 1 adds a debug-level log line for the short-circuit path, which is sufficient.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
  - ux-design-minion: No -- no UI changes
  - accessibility-minion: No -- no web-facing UI
  - sitespeed-minion: No -- no web-facing runtime changes
  - observability-minion: No -- no new services or coordination needs
  - user-docs-minion: No -- no user-facing behavior changes that need documentation
- **Not selected**:
  - api-spec-minion: No OpenAPI spec changes (Content-Disposition is not part of the API contract)
  - software-docs-minion: No architecture changes

### Decisions

- **Consolidation: 4 tasks into 2**
  Chosen: One task per issue (2 tasks total)
  Over: 4 separate tasks (period helper extraction, dedup short-circuit, filename helper, handler wiring) as proposed by api-design-minion
  Why: Each fix is small enough to implement in a single pass. Splitting the period helper extraction into its own task adds coordination overhead for a 1-line inline computation. Similarly, the filename helper and handler wiring are inseparable in practice -- the function only exists to serve the handler.

- **Period helper: inline vs extracted**
  Chosen: Inline 1-line period computation at the call site in index.js
  Over: Extracting a shared `computeNotificationPeriod()` utility function
  Why: The computation is `YYYY-MM` from `new Date()` -- a single template literal. Extracting it into a shared module adds a file/export for no reuse benefit. The index.js call site and email-dispatch.js already compute the same thing independently; they are both correct and will stay in sync because the format is trivially obvious.

### Risks and Mitigations

1. **Race condition on dedup check (Task 1)**: Between the call-site `checkNotificationSent` read and `dispatchNotification`'s internal `markNotificationSent` write, a concurrent capture could pass the same check. Mitigated: `dispatchNotification()` retains its own internal dedup as a safety net. The call-site check is purely a performance optimization. A rare false-negative (check says not sent, but another worker already sent it) results in the internal dedup catching it -- no duplicate notifications.

2. **Filename encoding edge cases (Task 2)**: Some HTTP clients may mishandle certain characters in Content-Disposition. Mitigated: Aggressive ASCII-only sanitization (only `a-z`, `0-9`, `.`, `-`), 100-char domain truncation, and fallback to generic filenames if URL parsing throws.

3. **`record.url` could be malformed in DB (Task 2)**: Historical captures might have unexpected URL formats stored. Mitigated: `new URL()` is wrapped in try/catch with fallback to the existing generic filenames. No 500 errors on bad data.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Skip approaching_limit dispatch (#187) -- src/index.js + test/notification-triggers.test.js
  Task 2: Descriptive filenames (#181)            -- src/index.js + test/capture-retrieval.test.js
```

Both tasks modify `src/index.js` but in completely separate sections (lines 306-328 for Task 1, lines 1720-1810 for Task 2). No merge conflicts expected -- they can run in parallel.

### Verification Steps

1. `npx vitest run` -- all tests pass (existing + new)
2. Verify Task 1: check that `test/notification-triggers.test.js` has tests for the short-circuit path
3. Verify Task 2: check that artifact download responses contain domain+date in Content-Disposition header
4. Manual spot-check: confirm `src/index.js` changes are in the correct locations and don't overlap
