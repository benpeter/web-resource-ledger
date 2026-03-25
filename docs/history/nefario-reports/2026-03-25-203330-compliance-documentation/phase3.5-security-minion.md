## Security Review: Compliance Documentation Delegation Plan

### Verdict: ADVISE

The plan is well-constructed and shows strong security discipline. The residual
risks are documented honestly, sensitive implementation details are explicitly
excluded from the whitepaper, and the claims I spot-checked against source
files are accurate. The plan can proceed with the following issues addressed or
acknowledged before the whitepaper approval gate.

---

### Issues

#### HIGH: TOCTOU residual risk description needs a remediation path, not just a disclosure

**Location**: Task 3 (whitepaper), Section 7 -- SSRF Prevention

The plan correctly requires honest disclosure of the TOCTOU DNS re-resolution
risk between `url-validation.js`'s IP check and Browser Rendering's DNS
resolution. However, the whitepaper's "Residual Risks" section (Section 12)
lists this risk without mandating a mitigation statement.

For enterprise reviewers, a bare "residual risk" without any compensating
control reads as an open vulnerability, not a disclosure. The whitepaper should
pair this risk with the actual compensating control: Cloudflare Browser
Rendering runs inside Cloudflare's infrastructure. DNS re-resolution to a
private IP inside that environment resolves to addresses outside the customer's
internal network in the overwhelming majority of attack scenarios. That is a
meaningful compensating control even if imperfect.

**Remediation**: The whitepaper task prompt should instruct the agent to frame
residual risks with their compensating controls, not as bare admissions. Replace
"enumerate honestly" with "enumerate honestly with the compensating control for
each". This will make Section 12 more useful to reviewers and less likely to
trigger a rejection on a technicality.

---

#### HIGH: "Fail-open for non-critical services" in TOMs requires precise language

**Location**: Task 5 (DPA), Annex B -- TOMs, Availability row

The Availability TOM includes: "fail-open for non-critical services". In a
security-reviewed DPA, "fail-open" is a red flag phrase to enterprise security
reviewers. Without qualification, it reads as "the system bypasses controls on
failure."

What the system actually does is correct GDPR-aligned behavior: TSA failures
produce `tsaStatus: 'error'` (the capture still succeeds but the timestamp is
degraded), threat-check failures are logged and monitored (they do not allow
captures to skip screening silently -- verify this is accurate in the capture
pipeline). The distinction matters.

**Remediation**: Replace "fail-open for non-critical services" in the TOMs
prompt with language like: "Feature degradation is isolated -- failures in
non-critical services (TSA, email) result in degraded output flagged in
response data, not silent bypass of security controls." This is more precise
and less alarming to reviewers. Before the agent writes the whitepaper or DPA,
verify in `src/capture.js` and `src/threat-check.js` that threat-check failures
do not silently allow captures to proceed.

---

#### MEDIUM: TSA Failures alert is miscategorized in the incident response document

**Location**: Task 4 (incident response), Section 1 -- Detection

The plan categorizes `[WRL] TSA Failures` under "Degraded Service" but
`alerts.md` shows `[WRL] TSA Failures` is P3 monitoring the Sectigo qualified
TSA service. `[WRL] TSA Failures` monitors the standard (DigiCert) TSA and is
also P3. The plan conflates the two: the incident response prompt puts
"[WRL] TSA Failures (P3)" under Degraded Service and "[WRL] Qualified TSA
Failures (P2)" also under Degraded Service -- that P2 classification for
qualified TSA failures is correct in `alerts.md`.

Cross-checking: the plan lists `[WRL] TSA Failures` as P3 (correct) and
`[WRL] Qualified TSA Failures` as P2 (correct). The categorization is
accurate. This is a false concern -- no action needed on categorization.

However: the incident response document should note that TSA failures are
*not* a data breach vector, to prevent a reviewer from conflating degraded
timestamping with a security incident. This context aids an enterprise reader's
risk assessment.

**Remediation**: Add one sentence in the Degraded Service category: "TSA
failures affect the integrity guarantees of new captures but do not expose
tenant data or compromise existing capture records."

---

#### MEDIUM: DPA audit rights clause may create an unintended annual obligation

**Location**: Task 5 (DPA), Article 10 -- Audit Rights

The plan commits to "annual compliance questionnaire" as the audit right. This
is appropriate for a sole proprietor. However, "annual" implies a proactive
obligation to send it each year. If WRL fails to send a questionnaire in year 2,
a customer could argue the DPA term was breached.

**Remediation**: Change "annual compliance questionnaire" to "annual compliance
questionnaire upon written request" -- this preserves the right for customers
without creating a proactive obligation. Flag this explicitly in the DPA agent
prompt's "What NOT to do" list: "Do not commit to proactively sending an annual
questionnaire -- the commitment is to respond to one within a reasonable period
when requested."

---

#### LOW: IP pseudonymization output length disclosure in whitepaper

**Location**: Task 3 (whitepaper), Section 3 -- Data Classification

The `ip-hash.js` code produces a 16-char hex string (64-bit output) from a
full HMAC-SHA-256 (256-bit) by truncation. The whitepaper prompt says to
document "HMAC-SHA-256, daily rotation" as the pseudonymization method, which
is accurate. However, documenting that the output is a 16-char hex string
would reveal the truncation factor (32 of 64 possible hex chars = 128 of 256
bits), which slightly aids preimage attacks on IP hashes.

The whitepaper constraint ("Do not reveal... KV key formats or error handling
internals") covers this implicitly, but the agent is also instructed to read
`ip-hash.js` directly and document the implementation. Ensure the agent does
not transcribe the output length or truncation detail.

**Remediation**: Add to the Task 3 whitepaper prompt's "What NOT to do" list:
"Do not describe the bit length or output length of the IP pseudonymization
hash."

---

#### LOW: Data deletion procedure documents a 30-day grace period that may not be implemented

**Location**: Task 2 (data retention), Deletion Procedure step 3

The plan instructs the agent to document a 30-day grace period as policy. The
task's own constraints acknowledge: "Be honest: 'The deletion procedure is
currently operator-initiated. Automated self-service deletion is planned.'"

If the 30-day grace period is also not yet implemented (no cron job, no status
flag), publishing it as a documented commitment creates a compliance gap: GDPR
Art. 17 requires deletion be achievable in a reasonable time, and the DPA will
reference this policy with specific timelines.

**Remediation**: Before execution, verify in `src/db.js` and `wrangler.toml`
whether the grace period mechanism exists. If it does not, the retention doc
must state: "The 30-day grace period is the intended policy. Current
implementation is manual operator-initiated deletion -- the grace period
tracking is not yet automated." This must be consistent with the DPA's deletion
obligation clause.

---

### Confirmations (verified accurate, no action needed)

- OAuth scope disclosure fix (Task 7): `src/oauth.js` line 129 confirms
  `read:user user:email`. The fix is correct.
- Ed25519 signing claim: verified in `src/signing.js`. Accurate.
- HMAC-SHA-256 daily rotation for IP pseudonymization: verified in
  `src/ip-hash.js`. Accurate.
- SSRF private IP blocklist: verified in `src/url-validation.js`. RFC 1918,
  loopback, link-local, CGNAT all covered. Accurate.
- 9 Coralogix alert rules: verified in `docs/operations/alerts.md`. Count and
  priority classifications in the plan are accurate.
- "No raw PII in logs" claim: consistent with `src/log.js` (NEVER LOG
  contract). Accurate.
- Subprocessor list of 8 services: plan includes Cloudflare, GitHub, Stripe,
  DigiCert, Sectigo, Coralogix, Resend, Google Web Risk. The missing Resend and
  Google entries in the current privacy policy are correctly identified.
- 48-hour customer breach notification / 72-hour authority notification
  timeline: consistent between Task 4 and Task 5. Correct GDPR Art. 33/34
  alignment.
- "No physical isolation, no per-tenant encryption": honest disclosure of
  actual architecture. Correct.
- Physical Security as N/A with reference to Cloudflare certifications:
  appropriate for a serverless architecture.

---

### Summary for Approval Gate (Task 3 -- Whitepaper)

Before approving the whitepaper at its gate, verify:
1. Section 7 and Section 12 pair each residual risk with its compensating control
2. The "fail-open" language is absent from the TOMs section
3. IP hash output length is not disclosed

The remaining issues (audit rights wording, deletion grace period honesty check,
TSA incident context) should be addressed in Task 4 and Task 5 prompts before
those tasks execute, but they do not require gating.
