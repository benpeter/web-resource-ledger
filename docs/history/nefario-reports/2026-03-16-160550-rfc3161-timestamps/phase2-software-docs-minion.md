# Software Docs Minion: Documentation Impact Assessment for RFC 3161 Integration

## Summary

The RFC 3161 timestamp integration touches every layer of WRL's documentation.
The `openapi.yaml` spec is the highest-priority artifact -- it is the API's
source of truth and must be updated before or alongside implementation. The
`datapackage-digest.json` format change (flat `signedData` to `signatures`
array) is architecturally significant enough to warrant an ADR, but the
project uses evolution log entries (`docs/evolution/`) rather than standalone
ADRs, so the format design should be captured in the phase's `decisions.md`.
There is no separate format specification document today; I recommend creating
one.

---

## Recommendations

### 1. OpenAPI Spec (`openapi.yaml`) -- MUST update

The OpenAPI spec is explicitly the project's API source of truth (called out in
`MVP.md`, `CONTRIBUTING.md`, and the spec itself). This change affects:

**VerificationCheck schema (line 399)**: The `name` enum is currently
`[artifactHashes, bundleHash, signature]`. Must add `timestamp` (or whatever
the 4th check is named). The description must explain what the timestamp check
verifies.

**VerificationSigning schema (lines 414-436)**: Currently models the flat
`signedData` shape (`bundleHash`, `signature`, `publicKey`, `signedAt`). This
must be restructured to reflect the new response shape. Two design paths:

- Option A: Keep `signing` as-is for the Ed25519 self-signature, add a sibling
  `timestamp` field for the RFC 3161 data. Simpler backward compat.
- Option B: Replace `signing` with a `signatures` array mirroring the internal
  format. Cleaner long-term but a breaking change to the verify response.

This is an **API design decision** that api-design-minion should own. The
documentation follows the decision.

**Verification endpoint examples (lines 1439-1488)**: All three examples
(`verified`, `notVerified`, `bundleMissing`) must be updated to include the
timestamp check and any new response fields. Add at least two new examples:
- Verified with timestamp
- Verified without timestamp (graceful degradation -- TSA unreachable)

**Verification endpoint description (lines 1376-1403)**: Currently says "three
checks" in multiple places. Must be updated to reflect four checks.

**API version**: Currently `0.3.0`. This is a non-backward-compatible response
shape change. Should bump to `0.4.0` at minimum, or consider whether the URL
version (`/v1/`) needs discussion (I'd say no -- this is additive, not
path-breaking, and pre-1.0 consumers expect shape evolution).

### 2. WACZ Format Specification -- SHOULD create

There is no standalone document describing the `datapackage-digest.json`
format. The format is currently defined implicitly in three places:

- `src/wacz.js` lines 98-114 (the producer)
- `src/verify.js` lines 99, 136, 151 (the consumer)
- `openapi.yaml` VerificationSigning schema (the API representation)

The migration from flat `signedData` to a `signatures` array is a format
version change. Future verifiers (third-party tools, the MCP server in Act 3,
any external WACZ consumer) need a reference for what the format looks like.

**Recommendation**: Create `docs/wacz-format.md` documenting:
- The `datapackage.json` structure (resources array, hash format)
- The `datapackage-digest.json` structure (old format for reference, new
  `signatures` array format)
- Each signature type (`self`, `rfc3161`) with field descriptions
- How `keyId` links to the key archive
- Versioning: how the `version` field in signatures relates to format changes

This is a small document (1-2 pages). It replaces the need for readers to
reverse-engineer the format from source code. It also supports the backlog
items around WACZ-Auth spec compliance and eIDAS that are parked in the
backlog.

**Timing**: Write this during the format design approval gate (Gate 2 in the
meta-plan), before implementation begins. The spec document and the code should
be written from the same design decision.

### 3. README.md -- MUST update

The README contains multiple references to the current format that need
updating:

**Line 72**: "Returns a JSON verification result with three checks:
`artifactHashes`, `bundleHash`, and `signature`." Must add the timestamp check.

**Lines 286-288 (Key Rotation section)**: "Each key is identified by a `keyId`:
the first 8 hex characters of the SHA-256 of the raw 32-byte public key. The
`keyId` is stored in the WACZ bundle's `signedData`..." The `signedData`
reference must be updated to reflect the new `signatures` array structure.

**Line 328**: "Third-party verifiers: match the `keyId` from a WACZ bundle's
`signedData` against this list..." Same `signedData` -> `signatures` update.

**Roadmap section (line 271-276)**: Act 2 description says "RFC 3161
timestamps, per-tenant keys, audit logging. Makes 'evidence' independently
verifiable." After this ships, this line should reflect that R11 is done.
However, this is post-merge cleanup, not pre-implementation work.

### 4. Verification Page (`src/verify-page.js`) -- MUST update

While this is technically code, it is also user-facing documentation. The
changes needed:

**CHECK_LABELS and CHECK_DESCS (lines 280-290)**: Must add an entry for the
timestamp check name. Label suggestion: "Independent timestamp". Description
suggestion: "Confirms the capture time was verified by an independent authority."

**Crypto details section (lines 377-395)**: Currently shows bundle hash,
signed-at, and public key link. Should be extended with TSA information when a
timestamp is present (TSA name, timestamp value). The frontend-minion
consultation in the meta-plan covers this.

**Status banner logic**: If the distinction between "verified with timestamp"
and "verified without timestamp" matters to users (ux-strategy-minion's
question), the banner text or a subtitle may need to change. This is a UX
decision, not a docs decision.

### 5. Evolution Log -- MUST create (per project rules)

Per `CLAUDE.md`, the phase directory `docs/evolution/0024-rfc3161-timestamps/`
must contain:
- `prompt.md` (already exists)
- `decisions.md` -- must capture the format design decision (flat vs. array,
  backward compat approach, TSA provider choice, ASN.1 approach)
- `outcome.md` -- post-implementation
- `process.md` -- post-PR, per nefario orchestration rules

The `decisions.md` should specifically document the `signedData` -> `signatures`
format migration with the old format, the new format, and why the change was
made. This serves the same purpose as an ADR in this project's documentation
style.

### 6. Backlog (`docs/backlog.md`) -- MUST update post-implementation

- Move R11 from Act 2 active to Done section
- Update any parking lot items that reference R11 as a dependency (R15 MCP
  server lists "R11 recommended")
- Review the "Signing and Legal" parking lot items -- eIDAS, WACZ-Auth, and
  multiple TSAs all become more concrete once R11 ships

### 7. CONTRIBUTING.md -- MINOR update

Line 69 mentions the smoke test validates "four things." If the smoke test
gains timestamp-related validation, this count may need updating. Low priority
-- check after implementation.

---

## Proposed Tasks

Ordered by dependency and priority:

| # | Task | Priority | When | Depends On |
|---|------|----------|------|------------|
| D1 | Update `openapi.yaml`: VerificationCheck enum, VerificationSigning schema, verification endpoint examples, check count descriptions | MUST | During implementation (alongside verify endpoint changes) | Format design decision (Gate 2) |
| D2 | Create `docs/wacz-format.md`: document datapackage-digest.json format (old and new) | SHOULD | At format design gate, before implementation | Format design decision (Gate 2) |
| D3 | Update `README.md`: verification check count, `signedData` references, key rotation docs | MUST | During implementation PR | Format design decision (Gate 2) |
| D4 | Update `src/verify-page.js`: CHECK_LABELS, CHECK_DESCS, crypto details | MUST | During implementation (alongside verify page changes) | UX decision (meta-plan Gate 3) |
| D5 | Write `docs/evolution/0024-rfc3161-timestamps/decisions.md` | MUST | During planning phase, before implementation | Planning consultations |
| D6 | Write `docs/evolution/0024-rfc3161-timestamps/outcome.md` | MUST | After implementation | Implementation complete |
| D7 | Write `docs/evolution/0024-rfc3161-timestamps/process.md` | MUST | After PR creation | PR created |
| D8 | Update `docs/backlog.md`: move R11 to Done, review dependencies | MUST | After merge | PR merged |
| D9 | Update `docs/evolution/README.md`: add phase 0024 row | MUST | During implementation PR | -- |

---

## Risks and Concerns

### Risk 1: OpenAPI spec drift during format design iteration

The format design (Gate 2) may go through iterations between api-design-minion
and security-minion. If the OpenAPI spec is updated early and the design
changes, the spec drifts from the implementation plan.

**Mitigation**: Update the OpenAPI spec as part of the implementation PR, not
during planning. The format spec document (`docs/wacz-format.md`) can be
written at planning time as a lighter-weight artifact. The OpenAPI spec should
be the last documentation artifact updated, validated against the actual
implementation.

### Risk 2: Backward compatibility documentation gap

Existing WACZ bundles use the flat `signedData` format. If `verify.js` is
updated to handle both old and new formats (which it should -- existing bundles
in R2 won't be re-signed), this dual-format behavior needs documentation.

**Where to document**: `docs/wacz-format.md` should have a "Format History"
section showing v1 (flat `signedData`) and v2 (`signatures` array), with a note
that the verifier accepts both. The OpenAPI spec should mention backward
compatibility in the VerificationResult description.

### Risk 3: "Three checks" is hardcoded in multiple places

A grep for "three" in the codebase related to verification would reveal all the
places that assume exactly three checks. Beyond the docs I identified:

- `openapi.yaml` line 483: "Results of the three verification checks"
- `README.md` line 72: "three checks"
- `verify-page.js` has no hardcoded count but the CHECK_LABELS/CHECK_DESCS
  objects act as an implicit enumeration
- Test files may assert on check array length

**Mitigation**: The implementation PR should include a project-wide search for
"three checks" and update all references. Add this as an explicit checklist
item in the implementation plan.

### Risk 4: No formal versioning for the WACZ format

The current `signedData` has a `version: '0.1.0'` field, but there's no
documented versioning policy. What version does the new `signatures` array
format get? Is this `0.2.0`? `1.0.0`?

**Recommendation**: The format design decision (Gate 2) should include a
version number decision. Document the versioning policy in `docs/wacz-format.md`.
Even a simple statement like "version follows semver; the signatures array is
version 0.2.0" is sufficient.

---

## Additional Agents Needed

### Already planned (confirm inclusion)

- **api-design-minion** (Consultation 2): Owns the format design decision that
  all documentation depends on. Critical path.
- **frontend-minion** (Consultation 5): Owns verify-page.js changes including
  documentation-relevant CHECK_LABELS and CHECK_DESCS.
- **ux-strategy-minion** (Cross-cutting): Determines whether the "verified with
  timestamp" vs. "verified without timestamp" distinction needs user-visible
  communication, which affects README and verify page wording.

### Not needed for planning

- **test-minion**: Test files that reference "three checks" need updating, but
  this is implementation work, not a documentation planning concern. The
  test-minion consultation in the meta-plan already covers test strategy.

### Observation

The `redocly.yaml` config is minimal (`extends: recommended`). The project runs
`npm run lint:api` (per CONTRIBUTING.md) against the OpenAPI spec. Any spec
changes must pass this linter. The implementation PR should run
`npx @redocly/cli lint openapi.yaml` to validate before pushing.
