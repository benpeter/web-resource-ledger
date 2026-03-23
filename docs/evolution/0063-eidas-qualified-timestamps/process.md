# Process: eIDAS Qualified Timestamps

## TL;DR

8 specialist agents planned, 6 architecture reviewers vetted, 6 execution tasks across 5 batches delivered the full eIDAS qualified timestamp feature: 24 files changed, +935/-98 lines, 1174 tests passing. The only test breakage was a pre-existing idempotency key format test that needed updating for the new dual-meter pattern. Zero BLOCK verdicts from architecture review -- all 6 reviewers returned ADVISE. Key conflicts resolved in synthesis: PATCH over PUT, dedicated column over config JSON, sequential TSA over parallel, 5s timeout over 3s/15s.

## Phase 1: Meta-Plan

Nefario identified 8 specialists for planning:
- **mcp-minion**: RFC 3161 protocol extension for auth
- **api-design-minion**: Settings endpoint design, response enrichment
- **data-minion**: Schema design, meter reporting, pricing
- **iac-minion**: Infrastructure config, secrets management
- **observability-minion**: Alerting strategy, log event design
- **security-minion**: Auth model, credential handling, billing invariants
- **frontend-minion**: Settings UI, toggle pattern, detail view
- **test-minion**: Test strategy across all modified modules

Lucy approved the team in autonomous mode.

## Phase 2: Specialist Planning

All 8 specialists ran in parallel and returned planning contributions. Key arguments:

**mcp-minion** argued for extending `requestTimestamp()` with an options bag for auth, sequential TSA calls, and a 15s timeout based on qualified TSA latency characteristics. They recommended separate username/password secrets.

**api-design-minion** wanted PATCH for the settings endpoint with field allowlisting, the `rfc3161_qualified` type discriminator, and snapshotting the eIDAS preference into the queue message at enqueue time.

**data-minion** argued strongly for a dedicated `eidas_qualified` column (not config JSON), citing the admin/self-serve collision risk. They proposed independent watermarks for dual-meter reporting.

**security-minion** flagged several critical concerns: session-only auth for settings (no API key), targeted merge (not reusing setTenantConfig), meter-only-on-success billing invariant, and credential leak prevention in error logs.

**frontend-minion** and **api-design-minion** disagreed on PATCH vs PUT. frontend-minion preferred PUT for simplicity. This was escalated to synthesis.

## Phase 3: Synthesis

Nefario resolved 7 conflicts:

1. **PATCH vs PUT**: PATCH chosen. api-design-minion's argument that a growing settings surface needs partial updates won over frontend-minion's simplicity preference.

2. **Dedicated column vs config JSON**: data-minion's argument was decisive. The admin config JSON is written by `setTenantConfig` (admin-only). A self-serve endpoint writing to it would be a security issue.

3. **Sequential vs parallel TSA**: mcp-minion's sequential approach adopted. The standard timestamp is the baseline that must succeed independently.

4. **TSA timeout**: Compromised at 5s (mcp-minion wanted 15s, spec said 3s). gru later confirmed qualified TSA responses are larger, validating the longer timeout.

5. **Auth secret format**: Single base64 string over separate username/password. Fewer secrets, simpler code.

6. **Endpoint path**: `/v1/account/settings` over `/v1/tenant/settings` to match the existing session-gated namespace.

7. **Signature type**: Underscore (`rfc3161_qualified`) over hyphen to match codebase conventions.

## Phase 3.5: Architecture Review

6 reviewers (5 mandatory + 1 discretionary), all ADVISE:

- **ux-strategy-minion**: Flagged the 402 dead end -- user needs a billing portal link, not just an error message. Also wanted error states surfaced in the UI.
- **margo**: Called out `calculateEidasCharges` as dead code (Stripe handles billing) and the `buildToggleRow` helper as premature (only one add-on). Both adopted.
- **test-minion**: Recommended a dedicated test task and seed helpers. Test task deferred to post-execution.
- **security-minion**: Flagged TOCTOU in payment method check (single-batch fetch), credential leak risk in wacz.js error logs, "structurally valid" wording for verification, CSRF for PATCH.
- **lucy**: Noted free tier uses 50 (Stripe config) not 100 (issue text). Flagged 5s timeout deviation for documentation.
- **gru**: Important finding -- Sectigo URL should be HTTP not HTTPS. Also noted Sectigo is staging/low-volume only; qtsa.eu is the production path.

All ADVISE items were folded into task prompts.

## Phase 4: Execution

5 batches, 6 tasks, completed in order:

**Batch 1** (parallel): Task 1 (data-minion: migration) + Task 5 (iac-minion: infra config). Both ran as team members. The migration file is 17 lines following established patterns. Infrastructure added QUALIFIED_TSA_URL to 3 config files, a Coralogix alert, a runbook, and updated audit log schema.

**Batch 2**: Task 2 (data-minion: DB accessors + core pipeline). Modified 5 source files. Key design decision: UPSERT for `setEidasQualified` instead of UPDATE -- handles the edge case of configuring eIDAS before a tenant's first capture. Independent watermark advancement in meter reporter prevents one Stripe failure from blocking the other meter.

**Batch 3**: Task 3 (mcp-minion: WACZ + verification). Added the qualified TSA call to wacz.js and Check 5 to verify.js. Used "structurally invalid" wording per security reviewer advice.

**Batch 4**: Task 4 (api-design-minion: API + capture pipeline). The largest task -- modified account.js, index.js, capture.js, and responses.js. Single query for payment method + current eIDAS state avoids TOCTOU. The billing-critical invariant (meter only on `qualifiedTimestampStatus === 'present'`) is enforced in the queue consumer.

**Batch 5**: Task 6 (frontend-minion: settings UI + detail view). Added the Add-ons section with inline toggle, confirmation dialog, 402 handling with billing portal link, and timestamp status in capture detail.

## Test Results

One test failed after Task 2: the idempotency key format test expected `wrl-meter:...:77` but the new dual-meter code produces `wrl-meter:...:captures:77`. This was an intentional format change (meter type now part of the key for dual-meter support). Fixed the test assertion.

Final: 1174 passed, 0 failed, 2 skipped (pre-existing).

## Human Interventions

This was an autonomous session -- no human interventions at any gate. Lucy approved all decisions. The autonomous mode protocol made gate decisions based on plan alignment and convention compliance.

## Where to Read More

- Full specialist planning contributions: see nefario scratch files (copied to nefario report companion directory)
- Synthesis with all conflict resolutions: `phase3-synthesis.md` in companion directory
- Architecture review verdicts: `phase3.5-*.md` files in companion directory
