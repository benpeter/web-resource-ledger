APPROVE

The test strategy is sound. No blocking concerns from the testing domain.

**What the plan gets right:**

1. **Fallback path covered by unit tests.** The unit test additions are precise: assert `body.build` is undefined (not merely absent from toMatchObject), assert `Cache-Control: no-store` on the primary test and trailing-slash test. These are the right assertions for the fallback path.

2. **Injection path covered by smoke test.** The typeof-guard approach means the injection path cannot be exercised in vitest/miniflare without injecting `--define` globals — which would add framework complexity for marginal gain. Delegating injection-path verification to the smoke test against a real deployment is the correct boundary call.

3. **Retry logic is correct.** 6 attempts at 5s fixed interval handles Workers propagation lag. Using `$((ATTEMPTS + 1))` instead of `((ATTEMPTS++))` avoids the `set -e` arithmetic trap (this is documented in project memory and correctly applied here).

4. **Skip guards are well-designed.** The hex-pattern guard (`^[0-9a-f]{7,40}$`) gracefully handles the production workflow's `inputs.ref` branch-name case. The absent-variable guard matches the existing `SMOKE_SKIP_CAPTURE` pattern for consistency.

5. **No shared state or test isolation issues.** The new unit test assertions extend existing tests rather than adding stateful setup. Smoke test Check 5 is self-contained.

6. **The `build` absent assertion is critical and correctly specified.** Asserting `expect(body.build).toBeUndefined()` (rather than just not asserting it) will catch a regression if the typeof guard is removed or a fallback value is added — directly protecting the primary design invariant.

**One minor note (not a blocker):**

The trailing-slash test currently only asserts `status: ok` — the plan adds `Cache-Control: no-store` to it. The plan should confirm that `body.build` undefined is also asserted in the trailing-slash test for consistency, since both routes invoke `handleHealth()`. This is not blocking: if the trailing-slash test omits the build-undefined assertion, the primary test still covers the invariant and the implementation is shared code.
