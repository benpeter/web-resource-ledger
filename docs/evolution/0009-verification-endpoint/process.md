# Process: Verification Endpoint

## TL;DR

Four agents, three batches, one gate, ten advisories, zero blocks. The
verification endpoint went from issue to 33 passing tests in a single
nefario run. The most valuable Phase 3.5 catch was the `buildTestWacz`
helper bug -- the plan's test helper would have used the wrong hash for
`signedData.hash`, producing structurally invalid WACZs that would have
passed tests for the wrong reasons.

## Team

**Planning phase (4 specialists)**:
- api-design-minion: endpoint contract, response shape
- security-minion: trust model, key pinning, cache safety
- ux-strategy-minion: response shape, journey coherence
- test-minion: test strategy, test data design

**Review phase (5 mandatory)**:
- security-minion, test-minion, ux-strategy-minion, lucy, margo
- No discretionary reviewers selected (no UI, no web pages, no
  multi-service coordination)

**Execution phase (2 agent types)**:
- debugger-minion: Tasks 1 (verify.js) and 2 (endpoint handler)
- test-minion: Tasks 3 (unit tests) and 4 (integration tests)

## Planning Conflicts

Five conflicts surfaced during specialist planning. All resolved in
synthesis before Phase 3.5 review.

### Conflict 1: Key Pinning (the big one)

security-minion argued for server-key-only (`env.SIGNING_KEY`).
ux-strategy-minion argued for embedded key (simpler, survives key rotation).

The code itself settled this: `src/wacz.js` line 99-100 says "Verifiers
MUST pin against an operator-published key." Using the embedded key would
make the verification endpoint prove nothing -- any attacker who replaces
the WACZ can replace the embedded key too.

security-minion won decisively. Key rotation degradation is accepted as an
MVP limitation (backlogged: key versioning + old key archive).

### Conflict 2: Cache-Control

The issue spec said `immutable`. security-minion pointed out that
verification depends on a mutable trust anchor (the signing key). If the
key is compromised, `immutable` persists stale verification results
indefinitely.

ux-strategy-minion provided the refinement: cache verified:true (24h),
no-store for verified:false. This was a good example of a specialist
improving another specialist's position rather than opposing it.

### Conflict 3: Response Shape

api-design-minion proposed an array of `{ name, passed, detail? }` objects.
ux-strategy-minion proposed a flat object with `pass/fail/skip` strings.
Synthesis merged both: array format (extensible) with `pass/fail/skip` enum
(forward-compatible).

### Conflicts 4-5: No-WACZ Captures and Check Count

Universal consensus on 404 for no-WACZ captures. security-minion and
ux-strategy-minion both argued for three checks (vs api-design-minion's
MVP-two suggestion). Three checks won on the strength of "complete
tamper-evidence" and the low implementation cost.

## Phase 3.5: Where the Value Was

All five reviewers returned ADVISE. No blocks. The advisory count (10) was
unusually high for a clean plan, but the advisories were genuinely useful.

**The critical catch**: test-minion identified that the synthesis plan's
`buildTestWacz` helper set `signedData.hash` to `dpHashOfBytes` (SHA-256 of
the pretty-printed `datapackage.json` bytes) instead of `bundleHash`
(SHA-256 of the canonical JSON). This is a structural bug: the WACZ build
path in `src/wacz.js` uses canonical JSON, so using pretty-printed bytes
would produce test WACZs where bundleHash verification always fails. The
test would then need to be wrong to pass, hiding the real behavior.

**security-minion's advisories**: Five warnings, all incorporated. The
highest-priority was dropping `capture.url` from the verify response -- the
retrieval endpoint uses `private, no-store` specifically to protect URLs,
and the verify endpoint's public 24h cache would have leaked them. This was
a genuine information disclosure that would have shipped without the review.

**ux-strategy-minion**: Renamed `wacz` to `signing` in the verify response
to avoid field name collision with the retrieval endpoint's `wacz` object
(which contains url, size, bundleHash). Different shapes under the same
field name across endpoints is a usability anti-pattern.

**lucy**: Ensured evolution log directory and `prompt.md` were created
before execution (project convention compliance), and that cache and
response shape deviations from the issue spec were documented.

**margo**: Noted the cache deviation should be documented as deliberate
(not accidental). Overlapped with lucy on this.

## Human Interventions

The human approved the plan and Task 1 gate without requesting changes. No
post-execution phase skips were selected (all phases ran). This was a clean
execution -- the specialist advisories did the intervention work that the
human would otherwise need to do at gates.

The human chose to compact context at the Phase 3.5 boundary (before
execution). This was the right call -- the Phase 2 specialist contributions
were large and no longer needed after synthesis.

## Where to Read More

- Full specialist planning contributions: `docs/history/nefario-reports/2026-03-14-180004-mvp-step-6-verification-endpoint/` (companion directory)
- Synthesis plan with all conflict resolutions: `phase3-synthesis.md` in the companion directory
- Phase 3.5 reviewer verdicts: `phase3.5-*.md` files in the companion directory
- Execution task prompts (with advisories folded in): `phase4-*.md` files in the companion directory
