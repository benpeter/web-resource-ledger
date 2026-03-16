# UX Strategy Review: RFC 3161 Timestamp Integration

**Verdict: APPROVE**

---

## Summary

The plan is coherent, appropriately constrained, and the UX decisions embedded in it are sound. The synthesis has already incorporated the key ux-strategy inputs (binary banner, "Independent time verification" label, neutral skip treatment) correctly. No blocking issues. Minor observations noted below for awareness.

---

## Journey Coherence

The user-facing journey is clean and complete:

1. Capture happens, timestamp obtained (or gracefully absent)
2. Verification page shows the new check in the existing check-row pattern
3. Crypto details panel gains two new rows (authority + time) when timestamp exists
4. Old captures (v0.1.0) render unchanged -- 3 checks, no timestamp row

The backward-compatibility treatment is correct UX. Showing a "timestamp absent" row for old captures would be misleading -- those captures were made before the feature existed. The plan correctly suppresses the row entirely for v0.1.0.

The graceful degradation path (TSA unavailable -> `skip` status) maps to a neutral outcome rather than a warning. This is the right call: a `skip` does not damage the evidence claim, and surfacing it as an amber warning would add cognitive load without actionable meaning for the user. The check row still renders with the skip icon, which is sufficient visibility.

---

## Cognitive Load

No increases. The plan adds one check row to an existing list of three. The label "Independent time verification" is concrete and scan-readable. The description "Confirms capture time was certified by an independent authority" is appropriately brief and non-technical.

The crypto details section gains two rows (authority, timestamp issued) conditionally. These are low-complexity additions that follow the established key-value grid pattern. Users who do not need this level of detail are not exposed to it (it lives in the expandable crypto section, which is already behind progressive disclosure).

The plan explicitly prohibits: trust tier badges, amber states, raw token data, TSA certificate details. These prohibitions prevent complexity creep. Enforced correctly in Task 5's "What NOT to do" list.

---

## Simplification Assessment

The plan is already well-simplified. The key simplification decisions are embedded and correct:

**Binary banner preserved.** The `verified` predicate remains a clean true/false. Skip on timestamp does not create a third state ("partially verified"). This is the right call -- a third banner state would demand user interpretation at the most prominent UI element.

**No failure metadata stored in WACZ.** When TSA is unreachable, the `rfc3161` signatures entry is simply absent. No `status: absent` marker. This is consistent with the principle that absence is self-documenting in a typed format.

**Minimal API surface.** Task 4 notes that timestamp data flows through automatically from `result.capture` to `body.signing` without additional assembly code. This is good -- no new code means no new cognitive surface for future maintainers.

**TSA URL as plain config, not a secret.** Correct. Avoids the friction of secret management for a well-known public endpoint.

---

## Jobs-to-be-Done Alignment

The user request states the primary job: transform WRL's evidence claims from operator-asserted to third-party-verified. Every deliverable in the plan serves this job directly:

- `rfc3161.js` obtains the third-party proof
- `wacz.js` stores it durably in the artifact
- `verify.js` surfaces it in verification outcomes
- `verify-page.js` communicates it to the human reviewer (journalist, researcher, legal professional)
- `openapi.yaml` + `README.md` make it legible to API consumers and integrators

No deliverable in the plan is indifferent or decorative. The logging extension (timestampStatus in capture.js) serves operational observability, which is a legitimate supporting job.

---

## One Observation (Non-blocking)

The TSA authority display in the crypto details panel will show the raw URL (`http://timestamp.digicert.com`) as the authority name. For the current scope (single TSA, pre-MVP), this is fine. If multiple TSAs are added later, consider mapping known TSA URLs to display names (e.g., "DigiCert Timestamp Authority"). This is a future-state concern -- YAGNI applies now.

---

## Decision

**APPROVE** -- proceed to execution as planned. No changes required.
