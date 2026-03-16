# UX Strategy: RFC 3161 Timestamp Display on Verification Page

## Recommendations

### 1. The Distinction Is Absolutely Meaningful to the Target Audience

Journalists, legal professionals, and researchers are the people WRL exists
for. For these users, the difference between "the service operator says this
was captured at 14:32" and "an independent third party cryptographically
confirms this existed at 14:32" is not a technical subtlety -- it is the
difference between evidence and a screenshot.

**Jobs-to-be-Done analysis**: The user's job is not "verify a WACZ file."
The job is: "When I need to prove web content existed at a specific time, I
want to show a verification result that a skeptical audience will accept, so
I can use this capture as credible evidence." The word "skeptical" is load-
bearing. An operator-asserted timestamp satisfies a cooperative audience. An
independent timestamp satisfies a skeptical one (opposing counsel, an editor
checking sourcing, a court).

This maps directly to the Kano model:
- **Must-be**: Verified/unverified (already present). Users expect this.
- **Performance**: Independent timestamp. Proportional satisfaction increase
  -- the stronger the temporal proof, the more useful the capture is as
  evidence. This is the differentiator that moves WRL from "archive tool"
  to "evidence tool."
- **Excitement**: Not applicable here. Timestamps are functional, not
  delightful.

The distinction must be surfaced. The question is how.

### 2. Operator-Only Signature Should Be Neutral Absence, Not a Warning

Three options were evaluated:

| Approach | Effect |
|----------|--------|
| **Warning** (amber/yellow treatment) | Creates false alarm. Operator signature is still a valid verification. Penalizing it retroactively undermines trust in all existing captures. Violates Nielsen's "match the real world" -- a self-signed document is normal, not suspicious. |
| **Not mentioned** (hide timestamp status entirely when absent) | Violates visibility heuristic. Users cannot assess what they cannot see. A journalist who knows independent timestamps exist will wonder why the page does not mention it -- and that silence breeds more distrust than an honest "not present." |
| **Neutral absence** (informational, non-alarming) | Communicates the fact without judgment. Respects the user's ability to assess the evidence for their context. Matches Starling Lab's approach of enabling audiences to "judge trustworthiness and draw their own conclusions." |

**Recommendation: Neutral absence.** When the timestamp check is absent,
display it as a fourth check row with a dash/skip icon (the existing gray
dash pattern) and a brief explanation like: "No independent timestamp was
obtained for this capture. The capture time is based on the service
operator's clock." This is honest, not alarming.

The framing principle: WRL should present facts about the evidence chain and
let users draw conclusions, not impose a trust hierarchy through visual
alarm signals.

### 3. Language That Communicates Value Without Jargon

The term "RFC 3161 timestamp" means nothing to the target audience. "TSA"
will be parsed as "Transportation Security Administration." Even
"cryptographic timestamp" overloads on a term most people only associate
with date/time.

**Recommended terminology**:

| Technical Term | User-Facing Label | Why |
|----------------|-------------------|-----|
| RFC 3161 timestamp | **Independent time verification** | "Independent" is the key word -- it communicates third-party involvement. "Time verification" is plain language for what it does. |
| TSA (Time Stamping Authority) | **Independent time authority** or just name the provider (e.g., "DigiCert") | Naming the provider is more concrete and trustworthy than an abstract role label. |
| Timestamp token/response | (Do not surface) | Implementation detail. Users don't need to know the mechanism. |
| Self-asserted timestamp | **Service timestamp** or **Capture time (operator clock)** | "Self-asserted" sounds defensive. "Operator clock" is factual and neutral. |

**Check row labels and descriptions** (matching existing pattern):

For the pass case:
- **Label**: "Independent time verification"
- **Description**: "Capture time confirmed by an independent authority (DigiCert)."

For the skip/absent case:
- **Label**: "Independent time verification"
- **Description**: "Not available. Capture time is based on the service operator's clock."

For the fail case:
- **Label**: "Independent time verification"
- **Description**: "Independent timestamp could not be verified."

Starling Lab's framing insight applies here: the value proposition is
"proving data existed before a certain time" via an external, uncontrollable
source. The user-facing language should echo this: an independent authority
confirmed the time, not just the operator.

### 4. Keep the Binary Verified/Unverified Banner -- Add Timestamp as Supplementary

**The status banner must remain binary.** This is the single most important
UX recommendation.

Rationale:

1. **Cognitive load**: The banner is the first thing users see. It answers
   the primary question: "Can I trust this capture?" Adding a third state
   ("verified with independent timestamp" / "verified without" / "failed")
   forces users to understand a taxonomy before they understand the answer.
   Hick's Law: 2 states = instant comprehension, 3 states = deliberation.

2. **Jobs-to-be-Done**: The user's primary job is "is this capture
   authentic?" The timestamp upgrades the *strength* of the answer, not
   the *category* of the answer. A capture verified by operator signature
   alone is still verified. Making the banner conditional on timestamp
   presence would retroactively downgrade all existing captures from
   "Verified" to some lesser status.

3. **Progressive disclosure**: The banner gives the top-level answer. The
   checks section provides the detailed breakdown. This is the correct
   information hierarchy -- overview first, details on demand. Adding
   timestamp nuance to the banner collapses two layers into one.

4. **Consistency**: The existing pattern (green banner = all checks pass,
   red banner = any check fails) is clear and learnable. Introducing a
   third color/state breaks the pattern for marginal benefit.

**However**: The timestamp check MUST affect the banner when it fails. If a
timestamp is present in the WACZ but fails verification, the capture is not
verified -- the banner should be red. The absence of a timestamp is neutral;
a broken timestamp is a failure.

**Recommendation for the checks section**:

The timestamp becomes the 4th check row, positioned after "Digital
signature" (which it extends conceptually). The visual treatment matches the
existing pattern exactly -- green check for pass, red X for fail, gray dash
for absent. No new visual patterns, no new colors, no special treatment.

The information architecture becomes:
```
[Status Banner: Verified / Verification Failed]

CAPTURE
  url, captured on date

CHECKS
  File integrity          [pass/fail]
  Bundle integrity        [pass/fail]
  Digital signature       [pass/fail]
  Independent time verification  [pass/fail/skip]

SCREENSHOT
  [image]

Cryptographic details (expandable)
  Bundle hash, Signed at, Public key
  + Timestamp authority, Timestamp issued at (when present)
```

This is progressive disclosure working correctly: the banner answers the
big question, the checks section shows each dimension, and the expandable
crypto details reveal the technical specifics for expert users.

### 5. Cryptographic Details Extension

When a timestamp is present, add to the expandable "Cryptographic details"
section:

- **Timestamp authority**: The TSA name (e.g., "DigiCert Timestamp Authority")
- **Timestamp issued**: The time from the TSA response, formatted the same
  way as "Signed at"

Do NOT add:
- TSA certificate fingerprint (expert-only, no user value)
- ASN.1 response blob (meaningless to all users)
- Timestamp token hash (implementation detail)

When a timestamp is absent, do not add placeholder rows to the crypto
section. Empty rows create visual noise for no informational purpose.

### 6. Avoid a Trust Tier System

It is tempting to create a visual hierarchy: "Basic Verification" vs.
"Enhanced Verification" or bronze/silver/gold badges. Do not do this.

**Why not**:
- It implies WRL has a product tier structure (it does not).
- It creates anxiety for users with operator-only captures ("Is my evidence
  good enough?") without offering them a way to upgrade.
- It introduces a mental model (tiers) that users must learn before they
  can interpret results.
- It is not how evidence works. Evidence is evidence. Stronger corroboration
  makes it more persuasive, but it does not change its category.

Instead: present each verification check as an independent fact. Let users
(and their lawyers, editors, or colleagues) assess the totality of evidence
for their specific context.

## Proposed Tasks

### Task 1: Add timestamp check row to verification page
- Add `timestamp` to `CHECK_LABELS` and `CHECK_DESCS` in verify-page.js
- Label: "Independent time verification"
- Description for pass: "Capture time confirmed by an independent authority."
- Description for skip: "Not available. Capture time is based on the service operator's clock."
- No new CSS classes needed -- reuses existing pass/fail/skip patterns
- Position: 4th row, after "Digital signature"

### Task 2: Extend cryptographic details section
- When verification response includes timestamp data (TSA name, timestamp
  time), add two rows to the crypto-grid: "Timestamp authority" and
  "Timestamp issued"
- Conditional rendering: only show when timestamp data is present
- Use same `crypto-row` / `crypto-label` / `crypto-value` pattern

### Task 3: Include TSA provider name in check detail
- When the timestamp check passes, the `detail` field should include the
  TSA provider name (e.g., "DigiCert Timestamp Authority confirmed at
  [time]"). This gives the check row a concrete, trustworthy detail without
  requiring the user to open the crypto section.

### Task 4: Ensure banner logic handles timestamp correctly
- Banner remains binary: Verified (all checks pass or skip) / Failed (any
  check fails)
- A `skip` status on the timestamp check must NOT turn the banner red
- A `fail` status on the timestamp check MUST turn the banner red
- This matches existing behavior for all checks (verify.js line 167:
  `checks.every(c => c.status === 'pass')`) but needs adjustment -- the
  `every` predicate must also accept `skip` status, OR timestamp skip must
  not be included in the verified calculation

**Important implementation note on Task 4**: The current `verifyWacz()`
function on line 167 uses `checks.every(c => c.status === 'pass')` to
determine the `verified` boolean. If the timestamp check can have status
`skip` (graceful degradation), this predicate will return `false` and mark
the entire capture as unverified. The verification logic must be updated so
that `skip` on the timestamp check does not fail the overall verification.
This is a critical interaction between the UX decision (skip is neutral)
and the backend logic. The recommended approach: `checks.every(c =>
c.status === 'pass' || c.status === 'skip')` -- but this must be evaluated
against whether ANY skip should be tolerated or only timestamp skips.

## Risks and Concerns

### Risk 1: Skip semantics are overloaded
The existing `skip` status (gray dash) currently means "check could not be
performed due to missing data" (e.g., line 77 in verify.js: artifactHashes
is skipped when datapackage.json is missing but digest is also missing).
Using `skip` for "timestamp was not requested/obtained" is semantically
different from "check was blocked by a prior failure." If both meanings
coexist in the same checks list, users may conflate them.

**Mitigation**: The check description text disambiguates. "Not available.
Capture time is based on the service operator's clock." is clearly different
from "datapackage.json missing from WACZ." But the implementation should
ensure the `detail` field always explains WHY the check was skipped.

### Risk 2: Verified predicate change has security implications
Changing `checks.every(c => c.status === 'pass')` to tolerate `skip` means
a capture with a missing `datapackage.json` (where artifactHashes is
skipped) could potentially be marked as verified if the other checks pass.
This is a backend design decision with security implications, not purely
a UX concern. The security-minion and api-design-minion must weigh in on
which checks are allowed to skip without failing verification.

### Risk 3: Users may not understand what "independent" means
"Independent time verification" assumes the user understands why
independence matters. For some users, all verification may feel equally
trustworthy regardless of who performed it.

**Mitigation**: The check description does the explanatory work. "Confirmed
by an independent authority (DigiCert)" names a concrete entity. Most
target users (legal professionals, journalists) understand the concept of
independent verification from their professional context. The page does not
need to teach the concept -- it just needs to present the fact.

### Risk 4: Future captures without timestamps look weaker
Once independent timestamps exist, captures that lack them (due to TSA
timeout, network issues, or pre-R11 captures) will implicitly look less
trustworthy even though they are exactly as reliable as before.

**Mitigation**: This is inherent and correct. Independent timestamps ARE
stronger evidence. The UX should not obscure this truth. The neutral
framing ("not available" rather than "warning") minimizes anxiety while
remaining honest. Pre-R11 captures will show 3 checks (no timestamp row at
all) rather than 4 checks with one skipped, which is the cleanest handling
-- the absence of the row means "this feature did not exist when this
capture was created."

**Implementation note**: The verification page should only show the
timestamp check row when the API response includes it. Pre-R11 captures
whose verification response has no `timestamp` entry in the checks array
should display exactly as they do today -- 3 checks. This avoids
retroactively adding a "skip" to captures that predate the feature.

## Additional Agents Needed

### api-design-minion (CRITICAL -- co-dependency)
The UX recommendations above depend on specific API response shapes:
- The `checks` array must include a `timestamp` entry with `pass`, `fail`,
  or `skip` status
- The `skip` status must carry a descriptive `detail` field
- The `signing` section (or a new section) must include `tsaName` and
  `tsaTimestamp` fields when available
- The question of whether `skip` tolerates overall `verified: true` is a
  shared concern between UX and API design

### security-minion (CRITICAL -- co-dependency on Risk 2)
The `verified` predicate change (tolerating `skip`) has security
implications that must be validated. Which checks may be skipped without
compromising the verification claim?

### frontend-minion (for execution)
All proposed tasks are incremental additions to existing HTML/CSS/JS
patterns in verify-page.js. No new visual patterns are needed. The
frontend-minion should implement using the existing `check-row`,
`check-icon`, `check-label`, `check-desc`, and `crypto-row` patterns
without introducing new CSS.
