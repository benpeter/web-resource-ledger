# Test Minion Review

**Verdict: APPROVE**

The testing plan is well-constructed and aligns with the project's testing philosophy. I have two advisory items the implementing agent should be aware of, but neither warrants blocking.

---

## What the plan gets right

**node:test is the correct choice.** Zero new devDependencies, consistent with the CLI's minimal-footprint ethos. The conflict resolution in the synthesis is sound.

**The PKIjs issue #332 test is the most important test in the suite.** The plan calls it out as CRITICAL and makes it the anchor for `cms-chain.test.js`. The "empty trustedRoots returns `{ valid: false }`" assertion is the right threat model for this risk. Approving this as specified.

**The real TSA fixture requirement satisfies the project principle "test the real boundaries."** `real-wacz.test.js` with a live DigiCert timestamp token, run against the bundled root, is exactly the integration test this feature needs. The fixture provenance documentation and `refresh-fixture.sh` show that the plan treats fixture rot as a first-class concern.

**Tamper detection coverage is complete.** All five corruption vectors (file content, datapackage.json, wrong key, timestamp token, appended byte) are called out. This is the correct set for a verification tool -- each maps to a distinct check in the pipeline.

**Security invariants are explicitly tested.** "Hash values never appear in failure details" and "all checks run even after first failure" are behavioral properties that belong in the test suite, not just in code comments. Glad to see them named.

---

## Advisory items

### 1. The key-resolver tests have no network coverage

`key-resolver.test.js` as specced covers `--key`, `--key-file`, `--trust-embedded`, and mutual exclusivity, but the origin resolution path (fetching `/.well-known/signing-keys`, keyId matching, fallback to `/.well-known/signing-key`) is absent from the unit test list. That path is the default trust model for remote captures.

The implementing agent should add stubs for the fetch calls (using `globalThis.fetch = mockFetch` or a local test double) to cover:
- Successful keyId match from `signing-keys`
- Fallback to `signing-key` when not found in list
- keyId mismatch on fallback (should error)
- v0.1.0 capture without keyId (uses current key)
- HTTP 429 with Retry-After (should surface clearly, not silently hang)

This is the difference between testing the module exists and testing it works. The `real-wacz.test.js` integration test covers the happy path end-to-end, but unit isolation for the error branches is missing.

### 2. `node --test` glob expansion on macOS

The `package.json` test script uses:
```
node --test test/unit/*.test.js test/integration/*.test.js
```

On macOS (the target dev platform), shell glob expansion happens before Node.js sees the arguments. This works correctly when run via `npm test` because npm uses a shell. However, if a test directory is empty (e.g., during development when only some test files exist), the glob will expand to nothing and `node --test` will run zero files silently rather than erroring.

More robust alternative:
```
node --test 'test/unit/*.test.js' 'test/integration/*.test.js'
```
Or pass `--test-reporter` with explicit file enumeration. This is a minor fragility worth noting rather than a blocker.

---

## No concerns on

- Framework selection (node:test, node:assert -- correct)
- Integration test using real fixture (required, correctly specced)
- Synthetic DER builders for unit tests (correct isolation strategy)
- Coverage approach: CMS chain 100% branch, CLI 90%+ line -- sensible, not blanket-percentage-chasing
- Fixture size discipline (capture a simple page, commit the minimum binary)
- The test runner setup producing a single `npm test` command that runs unit + integration in one pass
