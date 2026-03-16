## Domain Plan Contribution: security-minion

### Recommendations

#### Part 1: Staging Environment Secret Isolation

**Staging must be a fully isolated trust boundary.** Production and staging
share the same Worker codebase but must share zero secrets, zero data stores,
and (ideally) separate observability streams. The reasoning is straightforward:
staging is a lower-trust environment -- it runs unreviewed code on every push
to main, it may be accessed by CI automation with broad credentials, and bugs
in staging should never corrupt production evidence chains.

**Secrets isolation (Critical):**

1. **Separate API key (`CAPTURE_API_KEY`)** -- the current auth model
   (`src/auth.js`) uses a single static Bearer token. Staging must use a
   different key. This prevents accidental use of staging credentials against
   production (and vice versa). Generate a separate key with the same entropy
   (64+ hex characters). Store it as a GitHub Actions secret scoped to the
   staging environment (GitHub environment protection rules), never as a
   repo-level secret.

2. **Separate signing key (`SIGNING_KEY`)** -- this is the most critical
   isolation requirement. Production's Ed25519 private key signs evidence
   bundles whose integrity is the entire product's value proposition. If the
   staging signing key is the same as production, then captures made in staging
   (which may be tests, experiments, or captures of internal URLs) would be
   cryptographically indistinguishable from production evidence. Generate a
   dedicated Ed25519 keypair for staging. The staging public key should be
   clearly identifiable as non-production in any `.well-known/signing-key`
   response.

3. **Separate Coralogix send key (`CORALOGIX_SEND_KEY`)** -- yes, staging
   should use its own Coralogix subsystem or at minimum a distinct
   `applicationName` tag. The current `log.js` hardcodes
   `applicationName: 'wrl'`. For staging, this should be `wrl-staging` to
   prevent log cross-contamination. The risk of sharing is not just noise --
   it is that security event logs (auth failures, SSRF blocks, rate limit hits)
   from staging testing would be indistinguishable from production security
   events, degrading incident response signal. Two approaches:
   - **Preferred**: Use the same Coralogix send key but change
     `applicationName` to `wrl-staging` via a `wrangler.toml` env var. This
     requires no additional Coralogix configuration and allows filtering by
     application name in queries.
   - **Alternative**: Use a separate send key with a different subsystem
     entirely. More isolated but operationally heavier.

4. **GitHub Actions secrets must use environment protection.** Create a
   `staging` environment in the GitHub repo settings. Scope deployment secrets
   (`CLOUDFLARE_API_TOKEN`, `CAPTURE_API_KEY`, `SIGNING_KEY`,
   `CORALOGIX_SEND_KEY`) to this environment. This ensures that workflow runs
   triggered by PRs cannot access staging deployment credentials unless the
   workflow explicitly targets the `staging` environment.

**R2 bucket isolation (Critical):**

The current `wrangler.toml` already has `preview_bucket_name` set to
`wrl-captures-preview`. Staging should use a dedicated bucket
(`wrl-captures-staging`), distinct from both production (`wrl-captures`)
and local preview (`wrl-captures-preview`). Rationale:

- Staging captures should never pollute the production evidence store.
- A staging bug that writes malformed objects should not corrupt production
  data.
- Staging bucket should NOT have the same retention/lock policies as
  production -- test data should be deletable for cleanup.

**KV namespace isolation (Critical):**

Similarly, staging needs its own KV namespace. The production namespace
(`b5cd6168cd32485dba7a90558e5fad29`) contains capture metadata that forms
part of the evidence chain. Staging KV must be separate.

**Rate limiter namespace isolation (Medium):**

The `wrangler.toml` defines three rate limiter namespaces (1001, 1002, 1003).
Staging should use different namespace IDs to prevent staging traffic from
consuming production rate limit budgets. In Cloudflare Workers, rate limiter
namespace IDs are per-environment when using `[env.staging]` sections, so
this should happen automatically if the environment is properly configured.

**CI/CD pipeline security:**

- The GitHub Actions workflow for staging deploy should use a
  **least-privilege Cloudflare API token** -- scoped to deploy Workers and
  manage the staging R2 bucket/KV namespace only. Not a global account token.
- Pin the `wrangler` version in CI (already pinned in `package.json` at
  `4.73.0` -- good).
- Pin all GitHub Actions to commit SHAs (the existing `ci.yml` already does
  this for `actions/checkout` and `actions/setup-node` -- maintain this
  pattern).
- The smoke test in CI should use the staging API key, fetched from GitHub
  environment secrets. The smoke test must NOT hardcode any key value.

**Domain / routing separation:**

Staging should be accessible at a distinct URL (e.g.,
`wrl-staging.<account>.workers.dev` or a custom subdomain like
`staging.wrl.example.com`). The production domain must never route to
staging code. This is handled naturally by Wrangler's `[env.staging]`
environment, which creates a separate Worker deployment.

#### Part 2: ToS and Content Policy -- Legal and Security Considerations

**Essential legal provisions for a web archival service storing third-party content:**

1. **No guarantee of content legality.** The ToS must state that WRL captures
   content as-is from publicly accessible URLs. The operator does not endorse,
   verify, or take responsibility for the content at captured URLs. This is
   the foundation of the intermediary defense.

2. **Prohibited uses.** Explicitly prohibit:
   - Capturing URLs for the purpose of harassment, stalking, or intimidation
   - Capturing content the user knows to be illegal (CSAM, classified material)
   - Using WRL to circumvent access controls (paywalls, authentication)
   - Using the API for automated mass surveillance of individuals
   - Submitting URLs designed to trigger SSRF or attack WRL infrastructure

3. **Operator's right to remove.** Reserve the unrestricted right to remove
   any capture, suspend any API key, or block any IP at the operator's sole
   discretion, without notice. This is essential -- without it, the operator
   has no legal basis to respond to abuse reports.

4. **No warranty of availability or permanence.** The service provides
   captures on a best-effort basis. The operator may delete captures, shut
   down the service, or change terms at any time. This prevents reliance
   claims.

5. **Limitation of liability.** Standard limitation: the service is provided
   "as-is" with no warranty. Liability is limited to the amount paid (which
   for a free/personal service is zero). Consequential damages are excluded.

6. **Data handling and privacy.** Disclose:
   - What WRL stores: the URL submitted, the rendered content at that URL,
     HTTP headers, screenshots, IP hash (once R6 ships), timestamps
   - What WRL does NOT store: the submitter's identity beyond the API key,
     cookies from the target site, credentials
   - Retention policy: captures are stored indefinitely unless removed
   - GDPR note: if the captured content contains personal data of third
     parties, the submitter is the data controller for that data, not WRL

7. **Governing law and jurisdiction.** Specify the jurisdiction. Since the
   operator is in Germany (based on project metadata), German law applies.
   This also means GDPR applies by default.

8. **Changes to terms.** The operator may update the ToS at any time.
   Continued use of the API after changes constitutes acceptance.

**DMCA safe harbor -- even though "out of scope":**

The issue scope explicitly says "Out: DMCA process." However, from a security
perspective I must flag: WRL stores exact copies of third-party web content
(HTML, screenshots). This is the textual and visual reproduction of
copyrighted material. Even if the operator is in Germany (where DMCA does
not apply directly), the service may be accessible from the US, and the
copyright equivalent under German law (UrhG) has similar takedown provisions
(Stoererhaftung for intermediaries).

**My recommendation:** Include a minimal notice-and-takedown provision in the
content moderation policy, even if it is not a formal DMCA designation. This
means:

- Stating that WRL will respond to valid copyright complaints
- Providing contact information for complaints
- Reserving the right to remove content upon receipt of a valid complaint

This costs nothing to include and provides a defense against contributory
liability claims. Omitting it entirely creates a gap that could be exploited
by a bad-faith copyright claimant to argue the operator had no process for
handling infringement. A backlog item for a full DMCA/UrhG process can follow
later, but the ToS should not be silent on copyright.

**Abuse reporting mechanism -- structured endpoint vs. email:**

Both options have security tradeoffs:

| Factor | Email | Structured endpoint |
|--------|-------|-------------------|
| Spam/DoS | Moderate (email filters help) | Higher (needs rate limiting, CAPTCHA) |
| Structured data | No (free-form, hard to triage) | Yes (JSON schema, parseable) |
| Operational burden | Low (single mailbox) | Medium (new endpoint, storage, alerting) |
| PII handling | Moderate (reporter's email in inbox) | Controllable (define exactly what is collected) |
| Audit trail | Email thread (informal) | Structured log (better for compliance) |
| Attack surface | Zero (no new code) | Additional endpoint = additional attack surface |

**My recommendation for MVP:** Use email (`abuse@` on the operator's domain).
Rationale:

- KISS principle (Helix Manifesto)
- Zero additional code or endpoints to secure
- An abuse reporting endpoint would need its own auth model (you cannot
  require an API key from someone reporting abuse), rate limiting, input
  validation, and storage -- substantial scope for an MVP
- The volume of abuse reports for a single-operator service is effectively
  zero
- If volume increases post-multi-user, a structured endpoint (parked backlog
  item) can be built then

The email address should be published in the ToS, the content moderation
policy, and in the API responses (via a `Link` header or in the
`/.well-known/` space).

**Where ToS/policy should live in the codebase:**

- Static documents: `docs/legal/terms-of-service.md` and
  `docs/legal/content-policy.md` in the repo, rendered at build time or
  served as plain text
- API integration: add a `Link` header to all API responses pointing to the
  ToS URL, or expose a `GET /v1/terms` endpoint returning the document
- Verification page: add a footer link to the ToS on the static verification
  HTML page
- Version the documents with effective dates. Each revision should be a new
  commit with a clear changelog.

### Proposed Tasks

**Task S1: Create staging environment bindings in wrangler.toml**
- Add `[env.staging]` section with:
  - Separate R2 bucket (`wrl-captures-staging`)
  - Separate KV namespace (new namespace ID)
  - Separate rate limiter namespace IDs
  - `CORALOGIX_ENDPOINT` same as production
  - New var: `APPLICATION_NAME = "wrl-staging"` (or modify log.js to accept this)
- Deliverable: `wrangler.toml` with complete staging environment
- Dependencies: None

**Task S2: Generate staging secrets**
- Generate a separate `CAPTURE_API_KEY` for staging (64+ hex chars)
- Generate a separate Ed25519 keypair for staging (`SIGNING_KEY`)
- Store both via `wrangler secret put --env staging`
- Store both in GitHub repo environment secrets for the `staging` environment
- Deliverable: Staging secrets provisioned in Cloudflare and GitHub
- Dependencies: S1

**Task S3: Create staging deploy GitHub Actions workflow**
- New workflow file (e.g., `deploy-staging.yml`)
- Trigger: push to `main` (after CI passes)
- Uses GitHub `staging` environment with protection rules
- Uses pinned action SHAs (consistent with existing `ci.yml` pattern)
- Least-privilege Cloudflare API token (deploy Workers + staging bindings only)
- Runs `wrangler deploy --env staging`
- Deliverable: `.github/workflows/deploy-staging.yml`
- Dependencies: S1, S2

**Task S4: Staging smoke test**
- Script or workflow step that runs after deploy
- Calls `GET /health` on the staging URL
- Optionally: calls `POST /v1/captures` with staging API key, polls status,
  verifies round-trip (capture + verify)
- Must not hardcode any secrets -- reads from GitHub environment secrets
- Deliverable: Smoke test step in deploy workflow
- Dependencies: S3

**Task S5: Parameterize application name in log.js**
- Modify `log.js` to read `applicationName` from `env.APPLICATION_NAME` or
  default to `'wrl'`
- This ensures staging logs are tagged `wrl-staging` in Coralogix
- Deliverable: Updated `log.js`, updated `wrangler.toml` vars
- Dependencies: S1

**Task T1: Draft Terms of Service document**
- Create `docs/legal/terms-of-service.md`
- Include: scope of service, prohibited uses, operator rights to remove
  content, no warranty, limitation of liability, data handling disclosure,
  governing law (Germany), change notification mechanism
- Include effective date
- Deliverable: `docs/legal/terms-of-service.md`
- Dependencies: None

**Task T2: Draft Content Moderation Policy**
- Create `docs/legal/content-policy.md`
- Include: what content WRL stores, prohibited content categories, abuse
  reporting mechanism (email address), notice-and-takedown process (minimal),
  copyright complaint handling (minimal), response timeline commitment
  (reasonable effort, no SLA)
- Deliverable: `docs/legal/content-policy.md`
- Dependencies: None

**Task T3: Wire ToS and policy into API responses**
- Add `Link` header to all API responses pointing to ToS URL
  (e.g., `Link: <https://wrl.example.com/terms>; rel="terms-of-service"`)
- Add abuse contact to a discoverable location (either `Link` header with
  `rel="abuse-report"` or in the ToS/policy document itself)
- Update verification HTML page with footer links to ToS and abuse contact
- Deliverable: Updated `src/index.js`, updated `src/verify-page.js`
- Dependencies: T1, T2

**Task T4: Serve legal documents via API**
- Either: static endpoints `GET /terms` and `GET /content-policy` that return
  the markdown as `text/plain` or rendered as `text/html`
- Or: host on a separate URL (GitHub Pages, Cloudflare Pages) and link
- The simpler approach is serving from the Worker itself -- no additional
  infrastructure
- Deliverable: Legal document serving mechanism
- Dependencies: T1, T2

### Risks and Concerns

**Risk 1 (High): Production signing key reuse in staging.**
If the same `SIGNING_KEY` is accidentally used for staging, captures from the
staging environment would be cryptographically valid as production evidence.
This undermines the entire trust model. Mitigation: S2 explicitly generates a
separate keypair. Verification: compare public keys at
`/.well-known/signing-key` for production vs. staging -- they must differ.

**Risk 2 (High): Staging deploy token over-privileged.**
If the Cloudflare API token used for staging deploys has permissions to modify
production Workers, R2 buckets, or KV namespaces, a compromised CI pipeline
could affect production. Mitigation: create a purpose-scoped token with
permissions limited to the staging Worker name, staging R2 bucket, and
staging KV namespace.

**Risk 3 (Medium): Staging URL confusion.**
If staging is deployed to a URL that looks like production (or vice versa),
users or automated tools could submit real evidence captures to staging
(which has no retention guarantees and uses a different signing key).
Mitigation: staging domain should be clearly distinct
(`wrl-staging.workers.dev`), and the health endpoint could include an
`environment` field in its response to make the distinction machine-readable.

**Risk 4 (Medium): ToS without legal review.**
Agent-generated legal documents are not legal advice. The ToS and content
policy should be reviewed by someone with legal expertise before the
service is promoted publicly. The issue scope acknowledges this
("reasonable template"), but it is worth reiterating: the documents provide a
framework, not a guarantee of legal protection.

**Risk 5 (Medium): Abuse email as PII collection point.**
The abuse reporting email will receive reports that may contain PII (names,
URLs with personal data, descriptions of individuals). The operator must
handle this mailbox with appropriate data protection (GDPR applies in
Germany). This is an operational concern, not a code concern.

**Risk 6 (Low): Copyright takedown volume.**
Web archival services that store screenshots and HTML of third-party sites
can receive copyright complaints at scale. For a single-operator MVP this
is extremely unlikely, but the content moderation policy should establish
the process before it is needed.

**Risk 7 (Low): Log cross-contamination if applicationName not parameterized.**
If staging and production logs both use `applicationName: 'wrl'` in
Coralogix, security event investigation becomes unreliable. The risk is not
data loss but degraded incident response capability.

### Additional Agents Needed

**iac-minion** -- needed for:
- Creating the `[env.staging]` section in `wrangler.toml` with correct binding
  syntax
- Creating the staging R2 bucket and KV namespace via Wrangler or Terraform
- Authoring the `deploy-staging.yml` GitHub Actions workflow with proper
  secret handling and environment protection
- Ensuring the Cloudflare API token scoping is correct

**legal-minion** (if available) -- the ToS and content moderation policy would
benefit from a specialist with knowledge of German hosting provider liability
(Telemediengesetz, NetzDG applicability, Stoererhaftung), GDPR data controller
vs. processor distinctions for third-party content, and whether the "notice
and takedown" provisions in the content policy are sufficient under EU law.
If no legal specialist is available, the documents should carry a prominent
disclaimer that they are templates, not legal advice.

If a legal-minion does not exist in the agent framework, the security-minion
can draft the documents with appropriate caveats, but the operator should be
explicitly advised to have them reviewed by a human lawyer before public launch.
