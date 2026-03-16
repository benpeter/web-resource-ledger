ADVISE

- [security]: Link header uses `set()` which is correct, but the plan states this prevents injection -- verify the implementation note reaches iac-minion explicitly.
  SCOPE: Task 3, `src/index.js` universal header block
  CHANGE: The prompt already instructs `set()` over `append()`. Confirm iac-minion does not accidentally use `response.headers.append('Link', ...)` -- `append()` would allow a downstream handler to accumulate multiple Link headers if the response object is reused, which could be exploited to inject a attacker-controlled `rel="terms-of-service"` value if any future handler constructs responses that flow through the universal block with pre-set headers. The existing prompt text is correct; flag this as a mandatory code-review check in Phase 6 verification.
  WHY: Header injection via `append()` is a real CWE-113 vector. The mitigation is already in the prompt, but the verification step (step 6 in the plan) only greps for the string presence -- it does not confirm `set()` vs `append()`. A reviewer could miss this.
  TASK: Task 3 + Phase 6 verification step 6

- [security]: CLOUDFLARE_API_TOKEN scope is not constrained in the plan.
  SCOPE: Task 2, `.github/workflows/deploy-staging.yml`, `secrets.CLOUDFLARE_API_TOKEN`
  CHANGE: The staging deploy workflow should use a scoped Cloudflare API token with write access only to the `wrl-staging` Worker, not the production `wrl` Worker. If a single `CLOUDFLARE_API_TOKEN` secret is shared between staging and production deploys, a CI compromise (e.g., malicious PR that exfiltrates secrets via workflow) could redeploy production. The task prompt should instruct iac-minion to add an inline comment to the workflow noting that `CLOUDFLARE_API_TOKEN` must be a token scoped to the `wrl-staging` Worker only, and that production deploys require a separate token. This is a documentation/operator-guidance gap, not a code gap, but without it the operator will likely reuse one token.
  WHY: A compromised staging workflow with a production-scoped token is a lateral movement path from staging to production (A01 / supply chain risk). The plan identifies signing key reuse as a High-severity risk (Risk 3) but does not flag API token scope -- this is the same class of risk.
  TASK: Task 2

- [security]: Smoke test passes `SMOKE_API_KEY` as a `Bearer` token but the script spec does not mention authentication failure handling on the 401/403 case for the signing-key endpoint.
  SCOPE: Task 2, `scripts/smoke-test.sh`, check 3 (signing key)
  CHANGE: The `/.well-known/signing-key` endpoint is unauthenticated (it is in the route table without an auth check in the current codebase). This is correct behavior -- public key disclosure is intentional. The concern is that the smoke test plan lists a 401/403 as a FAIL condition for the capture round-trip (check 4) but does not specify the expected HTTP status code for check 3. The iac-minion should be explicit: check 3 MUST expect exactly 200 (no auth header sent). If the endpoint accidentally starts requiring auth in a future change, the smoke test must catch that as a failure. This is a test-completeness note, not a security fix -- but the security implication is that a mis-auth'd signing-key endpoint would break verifier integrations silently if the smoke test doesn't check the status code.
  WHY: The verification workflow depends on public key discoverability. A regression that puts auth on `/.well-known/signing-key` would break external verifiers. The smoke test is the only automated gate; it must check the status code explicitly.
  TASK: Task 2

- [security]: TERMS.md hardcodes `benpeter/web-resource-ledger` as the GitHub repository path in the Link header and all legal document URLs.
  SCOPE: Task 3, `src/index.js` Link header, `src/verify-page.js` footer, `openapi.yaml` termsOfService field
  CHANGE: This is a low-severity but real concern: the GitHub repository path is baked into Worker source code. If the repository is ever transferred or renamed, the legal discoverability URLs break silently -- the Worker continues to serve a `Link` header pointing to a 404. The plan acknowledges this under Risk 5 ("requires a code deploy to update"). No additional change needed here, but the iac-minion should add a comment in `src/index.js` adjacent to the Link header set call: `// TERMS_URL: update if repository is renamed`. This makes the coupling visible to future maintainers. Without the comment, the dependency is invisible.
  WHY: Invisible coupling between Worker source and GitHub repository path is a maintenance security risk (broken legal notice = liability exposure). The comment costs one line and eliminates the risk of the coupling being forgotten.
  TASK: Task 3

- [security]: The TERMS.md GDPR data handling section as specified places GDPR controller responsibility on submitters without mentioning the operator's own obligations for API key metadata.
  SCOPE: Task 3, `TERMS.md` section 8 (Data handling)
  CHANGE: The plan correctly notes that the TERMS.md should state "submitter is the data controller for captured third-party personal data." However, the operator holds API key associations -- even if keys are opaque strings, if they are tied to identity (email, account), the operator is a controller for that data. The task prompt does not instruct iac-minion to address this. Add to the TERMS.md data handling section: a brief acknowledgement that API key metadata (if any identity association exists) is held by the operator and subject to applicable data protection law. For a single-operator service with no current user registration, this is a placeholder sentence -- but omitting it entirely creates a false impression that the operator holds zero personal data.
  WHY: GDPR Article 13 requires transparency about what personal data the controller holds. API keys tied to identities are personal data. The current spec creates a gap.
  TASK: Task 3
