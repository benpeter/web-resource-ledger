# Margo Review: MVP Step 4 -- WACZ Bundling and Signing

## Verdict: ADVISE

The plan is well-scoped for the problem and the conflict resolutions are sound -- particularly choosing uncompressed WARC, graceful degradation, and avoiding warcio.js. The overall approach is proportional: one new dependency (fflate), manual WARC construction, no new services or infrastructure. That said, I have five concerns about unnecessary module proliferation, over-specified tests, and one abstraction that does not earn its keep.

---

### Advisory 1: hash.js is a one-liner that does not need its own module

- **[complexity]**: `src/hash.js` contains a single 3-line function wrapping `crypto.subtle.digest`
  SCOPE: `src/hash.js`
  CHANGE: Inline the SHA-256 helper directly into `src/wacz.js` as a local function (not exported, not a separate file). If `src/warc.js` also needs it for per-record digests, define it once in `wacz.js` and pass the results, or duplicate the 3-line helper in both files -- duplication of a trivial utility is cheaper than a new module.
  WHY: A 3-line function does not justify its own file, import, and mental overhead. The project currently has 6 source files; this plan adds 5 more. Removing `hash.js` as a standalone module reduces the new-file count to 4 and keeps the helper co-located with its only meaningful consumer. The project's own engineering philosophy says "minimize code and dependencies actively."
  TASK: 3

### Advisory 2: canonical-json.js probably belongs inline in wacz.js, not as a standalone module

- **[complexity]**: `src/canonical-json.js` is a ~5-line pure function with exactly one consumer (`src/wacz.js` for manifest hashing)
  SCOPE: `src/canonical-json.js`
  CHANGE: Consider defining `canonicalize()` as a local function inside `src/wacz.js` rather than a separate module. The test file (`test/canonical-json.test.js`) can import it from wacz.js if exported, or the determinism guarantee can be tested as part of the WACZ integration tests (which already include a "canonical JSON stability" test case in Task 4).
  WHY: The function has no second consumer today. Extracting a 5-line utility into its own module is premature separation -- it increases file count and import graph without reducing cognitive load. If a second consumer appears later, extraction is a trivial refactor. However, this is weaker than Advisory 1 because having a standalone test file for canonical JSON is legitimately useful for isolating failures, so I am not blocking on this -- just flagging it.
  TASK: 2

### Advisory 3: Task 2 specifies 12 test cases for a 5-line function -- test effort is disproportionate

- **[scope-creep]**: The canonical JSON test specification lists 12 distinct test cases for a function whose entire implementation is 5 lines of recursive JSON.stringify
  SCOPE: `test/canonical-json.test.js`
  CHANGE: Reduce to 4-5 tests that cover the actual contract: (1) key sorting, (2) nested key sorting, (3) determinism (different insertion order, same output), (4) arrays preserve order, (5) round-trip via JSON.parse. The remaining cases (unicode, string escaping, number representation, empty containers) test JSON.stringify's behavior, not canonicalize's behavior -- they add maintenance cost without covering new risk.
  WHY: Test code is still code. 12 test cases for a 5-line function that delegates to JSON.stringify is a ~24:1 test-to-implementation ratio. The function's only novel behavior is recursive key sorting; the rest is JSON.stringify doing its job. Over-testing trivial utilities consumes the complexity budget on low-risk code.
  TASK: 2

### Advisory 4: Task 3 prompt is ~200 lines of implementation pseudocode -- risks becoming copy-paste coding rather than engineering

- **[scope-creep]**: The Task 3 prompt specifies exact function signatures, exact data formats, exact byte-level details of PKCS8 headers, exact ZIP entry names, and step-by-step orchestration flow across 5 source files
  SCOPE: Task 3 prompt in the delegation plan
  CHANGE: Trim the Task 3 prompt to specify the contract (inputs, outputs, constraints, format references) and leave implementation to the agent. The current prompt is effectively a line-by-line implementation spec disguised as a task description. Trust the agent to make implementation choices within the stated constraints.
  WHY: Over-specified prompts create two problems: (1) the implementing agent follows the pseudocode literally even when a simpler approach is available, and (2) reviewers evaluate against the spec rather than against the actual requirements. The prompt should define what the WACZ must contain and what contracts the modules must honor, not dictate every local variable and helper function. This also makes the approval gate more meaningful -- the reviewer assesses the agent's design choices, not spec compliance.
  TASK: 3

### Advisory 5: fflate is justified but verify bundle size impact

- **[dependency]**: `fflate` is the only new dependency and replaces the far heavier alternatives (jszip, archiver, warcio.js) -- this is the right call
  SCOPE: `package.json` (fflate dependency)
  CHANGE: No change needed to the plan. Just a note for Task 3 execution: after adding fflate, verify that only `zipSync` is imported (tree-shakeable) and that the Worker bundle size delta is reasonable (fflate's full package is ~29KB minified, but STORE-mode-only usage should tree-shake to much less). If bundle size is a concern, `zipSync` with level 0 is simple enough that a manual ZIP writer (~80 lines for STORE-mode-only) could replace fflate entirely -- but that optimization is not worth doing unless bundle size proves problematic.
  WHY: The project currently has exactly one runtime dependency (`@cloudflare/puppeteer`). Adding fflate is reasonable for ZIP construction, but worth monitoring. Supply chain risk is low -- fflate is well-maintained, has no transitive dependencies, and is widely used. The "could we write 80 lines instead" question is worth asking but not worth blocking on.
  TASK: 3

---

### What the plan gets right

- **Uncompressed WARC and CDXJ**: Eliminating gzip from the pipeline removes an entire class of determinism bugs. Good KISS application.
- **Graceful degradation**: Not failing captures when signing is unavailable is the correct MVP behavior. Security-minion's "must fail" position would have created operational brittleness for a feature that has no consumer yet (no verification endpoint until Step 6).
- **No warcio.js**: Avoiding a dependency with incompatible transitive deps (hash-wasm, tempy, pako) in favor of ~100 lines of manual WARC construction is exactly right. WARC/1.1 is a simple text format.
- **Spike-first approach**: Task 1 validates the Ed25519 API before building the signing pipeline on top of it. The approval gate after the spike is well-placed.
- **datapackage-digest.json**: Following the WACZ-Auth spec rather than the original issue's rough sketch is the right call.

### Module count assessment

The plan adds 5 source modules (`signing.js`, `warc.js`, `cdxj.js`, `wacz.js`, `hash.js`) and 3 test files to a codebase that currently has 6 source modules and 7 test files. That is a near-doubling of the source file count. Per my advisories above, `hash.js` should be inlined (Advisory 1), and `canonical-json.js` could be inlined (Advisory 2, weaker). The remaining 4 modules (`signing.js`, `warc.js`, `cdxj.js`, `wacz.js`) each have distinct responsibilities that justify separation -- signing is a security boundary, WARC and CDXJ are format-specific builders, and wacz.js is the orchestrator. That decomposition is sound.

### Complexity budget tally

| Item | Cost (managed) |
|------|----------------|
| fflate dependency | 1 |
| signing.js module | 3 (abstraction layer -- justified by security boundary) |
| warc.js module | 3 (abstraction layer -- justified by format isolation) |
| cdxj.js module | 3 (abstraction layer -- justified by format isolation) |
| wacz.js orchestrator | 3 (abstraction layer -- justified as pipeline coordinator) |
| hash.js module | 3 (abstraction layer -- NOT justified, inline it) |
| canonical-json.js | 3 (abstraction layer -- marginally justified) |
| **Total** | **19** |

Removing hash.js as a standalone module saves 3 points. The remaining 16 is proportional for a feature that implements a multi-file archive format with cryptographic signing.
