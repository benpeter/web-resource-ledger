# UX Strategy Review: Capture Auth Gate

**Verdict: APPROVE**

## Journey Coherence

The three-task sequence forms a coherent whole. The user journey is well-scoped:

1. Tenant authenticates to retrieve their own captures (closed loop, no ambiguity)
2. Tenant generates a share token to delegate access to a specific capture
3. Recipient uses the share URL -- including the CLI path

The plan correctly identifies the CLI as a user-facing dependency (Task 2) rather than leaving it broken post-deployment. That sequencing decision protects the existing `npx @w-r-l/verify` workflow, which is the right call for a tool whose entire job is trustworthy verification.

## Share Token Mental Model

The share token model is simple enough to be user-safe. Three access states map cleanly to user needs:

- "I want to see my own captures" -> API key (already familiar)
- "I want to share a specific capture with someone" -> share token via POST endpoint
- "I want to verify a capture publicly" -> verify URL (unchanged)

There is no ambiguity between the three paths. The decision to scope share tokens to a single capture (not tenant-wide) is the right default -- it matches the job ("share this evidence with a lawyer") without over-granting.

The 410 vs 401 distinction for expired vs revoked is slightly leaky semantics from a security standpoint, but the plan's reasoning is sound: 410 is acceptable because the expiry was intentional and visible to the sharer. This is a reasonable tradeoff, not a UX problem.

## Cognitive Load Assessment

Low. The plan does not add decision points for the end user:

- Token-in-URL propagation (Task 2) is invisible to the recipient -- they just paste the share URL and it works
- The error message for 401 in the CLI is actionable and guides recovery
- The "What NOT to do" sections correctly refuse to add `--token` flags and `--api-key` flags that would create CLI surface area with no benefit

The 20-token-per-capture limit produces a 422 with a clear message. That is appropriate friction at the right moment.

## Simplification Opportunities

One minor note on the revocation endpoint path:

    DELETE /v1/captures/{id}/share/{tokenHashPrefix}

Identifying tokens by a 16-char hash prefix is an internal implementation detail leaking into the API surface. Users cannot see token hash prefixes in normal operation -- they receive the raw token once at creation and the shareUrl. The listShareTokensForCapture function returns the 8-char prefix for display, which differs from the 16-char prefix used for revocation. This is a small consistency gap, but it is bounded to the revocation endpoint and unlikely to cause real user confusion. Not worth blocking over.

## Does Each Task Serve a Real User Need?

- Task 1 (auth gate + share tokens): Yes. The core job is "control who can access evidence I've captured."
- Task 2 (CLI update): Yes. The job is "verify a capture someone sent me" -- the CLI must accept the same share URLs that tenants send.
- Task 3 (docs): Yes. The README currently tells users the capture ID is the access secret. Leaving that in place after this change would actively mislead new users.

All three tasks are necessary. None are speculative.
