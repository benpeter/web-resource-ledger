## Delegation Plan

**Team name**: fail-loudly
**Description**: Eliminate silent catch blocks across the WRL codebase, ensuring every catch either logs the error or handles a specific named error type. Rename timestampStatus 'absent' to 'skipped' for clear three-way semantics.

### Task 1: Fix all silent catch blocks and rename timestampStatus
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are fixing silent catch blocks across the WRL codebase to comply with the
    project's "fail loudly, degrade intentionally" principle. Every catch must either
    log the error or handle a specific, named error type. No bare `catch {}` blocks.

    Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/nefario/fail-loudly-2

    ## Changes Required (by file)

    ### 1. `src/log.js` -- Replace silent catches with `console.warn`

    The `log()` function has two silent catches. These CANNOT call `log()` (infinite
    recursion). Use `console.warn` as the fallback channel.

    Line 39: Change `.catch(() => {})` to:
    ```js
    .catch((err) => {
      console.warn('wrl:log_delivery_fail', { event: data?.event, errorMessage: String(err?.message ?? '').slice(0, 128) });
    });
    ```

    Line 40: Change `catch { return; }` to:
    ```js
    catch (err) {
      console.warn('wrl:log_build_fail', { event: data?.event, errorMessage: String(err?.message ?? '').slice(0, 128) });
      return;
    }
    ```

    Use `console.warn` (not `console.error`). The debugger-minion and observability-minion
    disagreed here. Resolution: `console.warn` is correct because this is telemetry
    degradation, not a system failure. The capture itself may have succeeded. The
    `wrl:` prefix makes these filterable regardless of severity.

    ### 2. `src/signing.js` -- Include error details in key validation warning

    Line 83: Change the bare `catch` to capture and log the error:
    ```js
    } catch (err) {
      console.warn('Signing key validation failed:', err?.message);
      return null;
    }
    ```

    Keep it as `console.warn` only. Do NOT add a `log(env, ...)` call here.
    Rationale: The observability-minion suggested adding a structured Coralogix event
    at severity 5, but this would require verifying that `env` is fully wired through
    at this point and adds complexity. The `console.warn` with the error message gives
    operators enough to diagnose misconfigured SIGNING_KEY values. If structured
    logging for this path is needed later, it can be added as a separate change.

    ### 3. `src/ip-hash.js` -- Log HMAC computation failure

    Line 59: Change `catch {}` to:
    ```js
    } catch (err) {
      console.warn('wrl:cip_hash_fail', err?.message);
      return undefined;
    }
    ```

    Use `console.warn` only (not `log()`). This function is called on every request.
    Adding a `log()` call would add a network call in the hot path. `console.warn`
    gives visibility in `wrangler tail` without latency impact.

    ### 4. `src/index.js` -- Two changes

    **Line ~187**: The `createCapture` catch block. Add logging before the 500 response:
    ```js
    } catch (err) {
      ctx.waitUntil(log(env, 5, 'capture', {
        event: 'capture.kv_create_fail',
        captureId,
        tenantId,
        cip,
        errorMessage: String(err?.message ?? '').slice(0, 256),
      }) ?? Promise.resolve());
      return problemResponse(500, 'Could not create capture record');
    }
    ```

    The `ctx.waitUntil(... ?? Promise.resolve())` pattern matches what is used elsewhere
    in this file (e.g., line ~202). `log()` returns undefined when Coralogix is not
    configured, so the `?? Promise.resolve()` guard is needed for `waitUntil`.

    **Line ~263**: Fix the `list.error` log severity from 3 to 5. This is a 500 error
    response -- severity 3 (info) is wrong, it should be severity 5 (error).

    ### 5. `src/consent.js` -- Add _error to top-level catch

    Line 71: Change the bare `catch` to capture error details:
    ```js
    } catch (err) {
      return {
        status: 'failed',
        cmp: null,
        durationMs: Date.now() - start,
        _error: {
          name: err?.constructor?.name ?? 'Unknown',
          message: String(err?.message ?? '').slice(0, 256),
        },
      };
    }
    ```

    This mirrors the pattern at `capture.js:609-613`. The caller at `capture.js:247-254`
    already checks for `_error` and logs it as `capture.consent_error`. So no new log
    event is needed -- just wire the error into the existing path.

    DO NOT change the `.catch(() => {})` calls on `frame.evaluate()` throughout
    consent.js (lines 103, 143, 144, 167, 242). These are genuinely expected for
    cross-origin and detached frames. Adding logging would generate noise. They ARE
    compliant because they handle a specific, named error type (frame lifecycle).
    However, ensure each has a comment explaining why it is intentionally silent.
    Add a brief comment if one is missing, e.g.:
    ```js
    // Cross-origin or detached frames may reject evaluate -- non-fatal
    ```

    ### 6. `src/capture.js` -- Three changes

    **Line ~335** (`getOrCreateSession` catch): Add logging for the session connect
    failure:
    ```js
    } catch (err) {
      // Expected: another worker claimed session between list and connect.
      // Also catches unexpected connect failures -- log to distinguish.
      console.warn('getOrCreateSession: connect failed:', err?.message);
    }
    ```

    **Line ~563** (partial capture deadline catch): Preserve the original error:
    ```js
    } catch (err) {
      throw new Error(
        `Partial capture failed: ${err?.message ?? 'unknown'}`,
        { cause: err }
      );
    }
    ```

    **Line ~660** (cleanup catch in finally): Log the cleanup failure:
    ```js
    .catch((err) => {
      console.warn('wrl:capture.cleanup_fail', err?.message);
    });
    ```

    ### 7. `src/cdxj.js` -- Add console.warn to toSurt fallback

    Line 75: Change `catch {}` to:
    ```js
    } catch (err) {
      console.warn('wrl:cdxj.surt_parse_fail', url?.slice(0, 100));
      return url;
    }
    ```

    ### 8. `src/wacz.js` -- Rename 'absent' to 'skipped'

    Line 45 (JSDoc): Change `'absent'` to `'skipped'` in the type annotation.
    Line 162: Change `'absent'` to `'skipped'` in the ternary return value.

    ### 9. Test file updates

    **`test/wacz.test.js`**:
    - Line ~270: Update test description from "absent" to "skipped"
    - Line ~278: Change `expect(result.timestampStatus).toBe('absent')` to
      `expect(result.timestampStatus).toBe('skipped')`

    **`test/wacz.test.js`** (CDXJ SURT describe block): Add a new test:
    ```js
    it('toSurt returns unparseable URL as-is', () => {
      expect(toSurt('not a valid url')).toBe('not a valid url');
    });
    ```

    **`test/key-rotation.test.js`**: Add a new test:
    ```js
    it('getSigningKeys returns null for malformed SIGNING_KEY', async () => {
      const result = await getSigningKeys({ SIGNING_KEY: 'not-valid-pkcs8-at-all' });
      expect(result).toBeNull();
    });
    ```

    ## What NOT to do

    - Do NOT add retry logic, circuit breakers, or queuing to any catch block
    - Do NOT change the `log()` function signature or return type
    - Do NOT modify anything in `src/vendor/`
    - Do NOT add `log()` calls where `env` is not available -- use `console.warn`
    - Do NOT change the consent.js frame-level `.catch(() => {})` calls to log
    - Do NOT add new Coralogix log events for signing.js or ip-hash.js (console.warn only)
    - Do NOT touch `verify-page.js` browser-side catch blocks
    - Do NOT touch `url-validation.js` catch blocks (they return meaningful errors)
    - Do NOT touch `kv.js` catch blocks (they already use console.warn)
    - Do NOT touch `verify.js` or `rfc3161.js` catch blocks (they return structured failures)

    ## Verification

    After making all changes, run:
    ```bash
    npx vitest run
    ```
    All tests must pass. If any fail, fix them.

    Then verify no bare `catch {}` or `catch { }` blocks remain in `src/`
    (excluding `src/vendor/`):
    ```bash
    grep -rn 'catch\s*{' src/ --include='*.js' | grep -v vendor | grep -v 'catch\s*(err' | grep -v 'catch\s*(_'
    ```
    Any remaining bare catches should either have a comment explaining why they are
    intentionally silent (consent.js frame catches) or should be fixed.

- **Deliverables**:
    - Modified files: `src/log.js`, `src/signing.js`, `src/ip-hash.js`, `src/index.js`, `src/consent.js`, `src/capture.js`, `src/cdxj.js`, `src/wacz.js`
    - Modified test files: `test/wacz.test.js`, `test/key-rotation.test.js`
    - All tests passing
- **Success criteria**:
    - No bare `catch {}` blocks remain in `src/` (outside vendor/) without either logging or a comment explaining intentional silence
    - `timestampStatus` uses `'present'`/`'skipped'`/`'error'` (no `'absent'`)
    - All existing tests pass
    - New tests for `getSigningKeys` malformed key and `toSurt` fallback pass
    - `grep -rn 'catch\s*{\s*}' src/ --include='*.js' | grep -v vendor` returns no results

### Cross-Cutting Coverage
- **Testing**: Covered within Task 1 -- test updates and new test cases are part of the implementation prompt. Phase 6 (post-execution) will run the full test suite.
- **Security**: No new attack surface. Changes add logging to existing catch blocks. The observability-minion verified that signing.js error messages from WebCrypto do not leak key material. No security review needed.
- **Usability -- Strategy**: Not applicable. No user-facing behavior changes. The `timestampStatus` rename is internal (KV records and logs only, not exposed in API responses). The verify API uses `checks[].status` which is unaffected.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: Phase 8 (post-execution) will handle any documentation updates. The changes are internal error handling improvements -- no API surface changes that require documentation.
- **Observability**: Covered within Task 1. The observability-minion's structured event specifications are incorporated into the task prompt (console.warn patterns, the index.js Coralogix event, severity fix).

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
    - observability-minion: The task is fundamentally about error observability -- adding log/warn calls to silent catches. Observability-minion should verify the event naming conventions and severity levels are consistent. (References Task 1: log.js, signing.js, ip-hash.js, index.js changes)
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, user-docs-minion

### Conflict Resolutions

**1. `console.warn` vs `console.error` for log.js meta-logging**
- debugger-minion recommended `console.warn` -- telemetry degradation is not a system failure
- observability-minion recommended `console.error` -- observability pipeline failure is an error
- **Resolution**: `console.warn`. The project's engineering philosophy prioritizes operational clarity. A Coralogix outage during an otherwise successful capture is degradation, not an error. The `wrl:` prefix ensures filterability regardless of console severity level. The distinction matters when someone is tailing logs -- `console.error` would create false urgency.

**2. Structured Coralogix events for signing.js and ip-hash.js**
- observability-minion recommended adding `log(env, 5, 'signing', ...)` and `log(env, 4, 'security', ...)` structured events
- debugger-minion recommended `console.warn` only for both
- **Resolution**: `console.warn` only. For signing.js, the error is a misconfiguration (wrong key format) that fires once at startup-equivalent time, not repeatedly. Console.warn with the error message is sufficient for diagnosis. For ip-hash.js, adding `log()` in the hot path (every request) is a latency risk for a non-fatal error. The observability-minion's revised recommendation agreed with console.warn for ip-hash.js. Keeping both consistent at console.warn reduces complexity.

**3. capture.js:563 partial capture catch -- preserve vs. replace error**
- debugger-minion recommended preserving the original error via `{ cause: err }`
- observability-minion classified this as already compliant (re-throws a categorized error)
- **Resolution**: Preserve the original error. The current code discards the original error entirely, which masks the root cause. Using `Error(..., { cause: err })` is zero-cost and gives operators the real failure reason when debugging partial capture failures.

**4. consent.js frame-level catches**
- All three specialists agreed: leave frame-level `.catch(() => {})` calls as-is. They handle expected cross-origin/detached frame failures. Logging would generate noise proportional to iframe count per page.
- **Resolution**: No changes to frame-level catches. Add/verify comments on each explaining why intentionally silent.

### Risks and Mitigations

1. **log.js recursion**: `console.warn` is used specifically to break the recursion chain. The prompt explicitly forbids calling `log()` from within `log()`. Mitigated by design.

2. **`'absent'` to `'skipped'` in existing KV records**: Old captures in production KV will still have `timestampStatus: 'absent'`. The verify API does not read this field (it verifies the WACZ directly). The retrieval API does not surface `timestampStatus`. No migration needed. Mitigated by analysis.

3. **console.warn noise during Coralogix outage**: At current scale (~10 captures/min), a full outage would produce ~30-50 console.warn lines per minute. Manageable. The `wrl:` prefix makes filtering trivial. Mitigated by bounded scope.

4. **Test brittleness from timestampStatus rename**: Only `test/wacz.test.js` asserts on `'absent'`. Integration tests assert on `'present'`. Single test update required. Mitigated by thorough audit.

### Execution Order

```
Batch 1 (single task):
  Task 1: Fix all catch blocks + rename timestampStatus + test updates
  (No approval gate -- straightforward implementation of audited changes)

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (vitest run)
```

### Verification Steps

1. `npx vitest run` -- all tests pass (including new tests for getSigningKeys and toSurt)
2. `grep -rn 'catch\s*{\s*}' src/ --include='*.js' | grep -v vendor` -- no bare silent catches remain
3. `grep -rn "'absent'" src/ --include='*.js'` -- no references to old timestampStatus value
4. Manual review: each catch block in src/ either logs (console.warn/log()) or has a comment explaining intentional silence
