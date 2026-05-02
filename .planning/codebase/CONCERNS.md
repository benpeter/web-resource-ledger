# Concerns & Technical Debt

Date of scan: 2026-04-30. Source: ripgrep/grep over `src/`, `test/`, `migrations/`,
`landing/`, `packages/` (excluding `node_modules`, `.wrangler`, `src/vendor/`),
plus `CLAUDE.md`, `OPERATIONS.md`, `DEPRECATION-POLICY.md`, `docs/backlog.md`,
`docs/evolution/README.md`, `docs/INTERNALS.md`, `CHANGELOG.md`.

---

## Known Fragile Areas

These are fragile areas explicitly called out by project documentation or
demonstrated by the codebase itself. Cited from `CLAUDE.md`, `OPERATIONS.md`,
and `docs/backlog.md` unless otherwise noted.

1. **Dashboard UI shares one global JS scope** (`CLAUDE.md` §"Dashboard UI Architecture").
   `src/ui/ui-shell.js` concatenates every `src/ui/ui-*.js` module's exported
   string into a single `<script>` block, so all top-level functions and
   `var`s collide. CLAUDE.md says "this has caused production bugs" and
   mandates view-prefixed names plus a pre-add grep. Evidence of an
   *active* collision is in **Forbidden Pattern Violations / Scope** below.

2. **`mcp.js` and `index.js` share business logic without a transport-neutral
   layer.** `docs/backlog.md` parking lot: *"Extract shared transport-neutral
   business logic from mcp.js and index.js route handlers — when mcp.js
   exceeds ~1500 lines or a third transport is added"* (Phase 0085). Current
   sizes: `src/mcp.js` 1349 lines, `src/index.js` 2544 lines. Already inside
   the trigger zone for `index.js`.

3. **Legacy `CAPTURE_API_KEY` migration is incomplete.** `OPERATIONS.md`
   §"Multi-Tenant Key Migration" Phase 3 instructs operators to wait for
   `security.legacy_auth_used` events to be zero for 7 days before retiring
   the legacy secret. `src/auth.js:212-213` still implements the legacy
   timing-safe fallback path; `wrangler.toml:208` and `docs/INTERNALS.md`
   still list `CAPTURE_API_KEY` as a runtime secret. The fallback path is
   live debt.

4. **Self-revocation guard for admin keys is unimplemented.** `src/admin.js:210`:
   *"TODO: Self-revocation guard (#42). When admin auth moves from ADMIN_KEY
   (env var) to KV-stored admin-scoped keys, prevent a caller from revoking
   their own keyHash. Requires the auth result to include the caller's
   keyHash, which it currently does not (ADMIN_KEY has no hash)."* This is
   the only TODO in non-vendor first-party source.

5. **Disaster recovery / D1 backups not in place.** `docs/backlog.md`:
   `[consider] Disaster recovery strategy + D1 backups (#149) — Before first
   paying customer | observability-minion`. No evidence of automated D1
   export in `scripts/` or `.github/workflows/`.

6. **CMP / autoconsent vendoring is manual.** `src/vendor/autoconsent-script.js`
   is a 3608-line vendored bundle. Backlog parking: *"[consider] Automated
   autoconsent update pipeline (#152) — When manual update lag causes CMP
   regressions"*. Evolution log Phase 0088 shipped a CI workflow for this,
   but the code in `src/vendor/` is still a hand-vendored snapshot whose
   freshness depends on that workflow running.

7. **Capture timestamp / TSA degradation must distinguish "unavailable" vs
   "misconfigured".** `CLAUDE.md` §"Fail loudly, degrade intentionally"
   warns against silent degradation. There is partial compliance — see
   `docs/backlog.md` parking *"[consider] Distinguish timeout vs failed in
   consent API result"* and *"[consider] WACZ captureQuality in
   datapackage.json"* — both flag exactly this kind of nuance still
   missing in surfaced API status.

8. **Coralogix DLQ alert for queue capture failures not yet provisioned.**
   `docs/backlog.md`: `[should] Coralogix DLQ alert for queue capture
   failures — When queue migration deploys to production`. Queue migration
   (Phase 0044) shipped; the `[should]` alert remains open.

9. **eIDAS qualified-TSA endpoint URL is a placeholder pending production
   rollout.** Backlog parking: *"[consider] Verify Sectigo qualified TSA
   endpoint URL — Before production eIDAS rollout; placeholder URL may
   need correction"* (Phase 0063). Same phase: `QUALIFIED_TSA_AUTH` secrets
   are not yet provisioned.

10. **Rollback caveats.** `OPERATIONS.md` §Rollback explicitly warns: *"This
    path bypasses the staging-first guarantee — it deploys directly to
    production without first deploying to staging"* and *"Secrets are NOT
    rolled back with code"*. Documented but inherent fragility of the
    rollback flow.

11. **`scripts/smoke-test.sh` does not enforce deploy version match.**
    `docs/backlog.md`: `[consider] Deploy version check in smoke test —
    When a deploy silently fails to update the Worker`. Latent risk.

---

## Forbidden Pattern Violations

### console.* in production code

`CLAUDE.md` requires `log(env, severity, subsystem, data)` from `src/log.js`
for all error/warning logging, with documented exceptions for `log.js`
itself, pure utilities without `env` (`cdxj.js`, `ip-hash.js`), and
third-party vendor code (`src/vendor/`). Internal helpers without `env`
(e.g. `capture.js` browser session helpers) also get an exception, "but
prefer threading `env` through when practical."

Grep result (`grep -rn 'console\.\(log\|warn\|error\|debug\)' src/`,
excluding `src/vendor/`):

| File:Line | Severity | Exempt per CLAUDE.md? |
|---|---|---|
| `src/log.js:52` | `console.warn('wrl:log_delivery_fail', …)` | **Yes** — `log.js` itself; explicit exception. |
| `src/log.js:55` | `console.warn('wrl:log_build_fail', …)` | **Yes** — same. |
| `src/ip-hash.js:60` | `console.warn('wrl:cip_hash_fail', …)` | **Yes** — `ip-hash.js` is named in CLAUDE.md as a pure-utility exception. |
| `src/cdxj.js:78` | `console.warn('wrl:cdxj_surt_parse_fail', …)` | **Yes** — `cdxj.js` is named in CLAUDE.md as a pure-utility exception. |
| `src/capture.js:353` | `console.warn('wrl:session_connect_fail', err?.message)` | **Borderline.** Inside `getOrCreateSession(browserBinding)` which does not currently take `env`. CLAUDE.md gives this category a soft exception ("internal helpers without `env`") but says "prefer threading `env` through when practical." Worth flagging as low-priority cleanup. |

No clear violations. The `capture.js` line is the only soft-exception case
that could be tightened by threading `env` into the session helper.

### Silent catch blocks

`CLAUDE.md`: *"Every catch must either log the error or handle a specific,
named error type."*

#### True empty `catch { }` in non-vendor code

`grep -rE 'catch\s*\([^)]*\)\s*\{\s*\}' src/` (excluding `src/vendor/`):
**zero matches.** Phase 0036 (`docs/evolution/0036-fail-loudly-2/`) appears
to have eliminated these.

#### Empty `.catch(() => {})` promise handlers

These swallow Promise rejections silently. Each is annotated in code with
a "non-fatal" / "Cross-origin or detached frames may reject" justification,
but they still meet the literal definition of a silent catch.

| File:Line | Context |
|---|---|
| `src/consent.js:112` | `frame.evaluate(initResp).catch(() => {})` — autoconsent init into iframe; non-fatal. |
| `src/consent.js:154` | `evalResp` reply into frame; non-fatal. |
| `src/consent.js:156` | Sibling promise to :154; non-fatal. |
| `src/consent.js:179` | `frame.evaluate(inject, [autoconsentScript]).catch(() => {})` — autoconsent late-frame inject. |
| `src/consent.js:254` | `frame.evaluate(wrappedScript).catch(() => {})` — same pattern in second injectIntoFrame. |
| `src/scheduler.js:138` | `await advanceSchedule(…, 'blocked').catch(() => {})` after a blocked-threat schedule. **This one is more concerning** than the consent.js cases: it silently swallows DB write failures inside the threat-block path, which means a blocked schedule could fail to advance and re-fire next minute. |

The `consent.js` cases are arguably defensible (cross-origin frame
evaluate is documented to reject for reasons that are not bugs), but they
should at minimum log at debug level. The `scheduler.js:138` swallow is
debt; recommend logging on failure.

#### `.catch(function() { … })` in `src/ui/`

48 occurrences. Spot checks (`ui-welcome.js:19`, `ui-poll.js:101`,
`ui-poll.js:111`, `ui-detail.js:393`) show that the bodies are not empty —
they implement fallback behavior (retry counter, fallback to text-select on
clipboard failure, etc.). Not silent catches in CLAUDE.md's sense; flagged
here only because the regex above would surface them in a stricter sweep.

---

### UI scope-collision (active latent bug)

CLAUDE.md warns this has caused production bugs and mandates name
prefixing. Cross-file `function …` declarations across `src/ui/*.js`:

```
src/ui/ui-billing.js:198: function buildStatusBanner(usageData) { … }
src/ui/ui-detail.js:34:   function buildStatusBanner(status)     { … }

src/ui/ui-settings.js:22: function formatDate(isoStr)            { … }
src/ui/ui-submit.js:25:   function formatDate(isoStr)            { … }
```

Concatenation order in `src/ui/ui-shell.js` (line numbers):
`SETTINGS_JS` (56) → `BILLING_JS` (59) → `SUBMIT_VIEW_JS` (71) →
`DETAIL_VIEW_JS` (74). Last definition wins.

- `formatDate`: both bodies are identical, so the collision is harmless
  duplication today, but still violates the prefix rule.
- **`buildStatusBanner` is an active latent bug.** Two different
  signatures and bodies:
  - `ui-billing.js` version takes `usageData` and returns a billing
    `alert` banner when `usageData.billingStatus === 'grace_period'` or
    `'blocked'`, else returns `null`.
  - `ui-detail.js` version takes a string `status` and returns a
    `detail-status-banner` element. Falls through to a "Status: Pending"
    banner for unknown values.

  Because `DETAIL_VIEW_JS` is concatenated after `BILLING_JS`, the
  detail-view definition wins. The single call site in billing
  (`ui-billing.js:169 — var banner = buildStatusBanner(usageData);`)
  passes an *object*, none of the equality branches match, and the
  detail-style "Status: Pending" banner is rendered in the billing view
  whenever billing status is `grace_period` or `blocked` — instead of the
  intended alert banner. Detail-view callers
  (`ui-detail.js:412, 552, 642`) pass strings and work as designed.

---

## TODO / FIXME / HACK

`grep -rE 'TODO|FIXME|XXX|HACK' src/ test/ scripts/ migrations/ landing/ packages/`,
excluding `node_modules` and `src/vendor/`:

| Tag | Location | Note |
|---|---|---|
| TODO | `src/admin.js:210` | "Self-revocation guard (#42). When admin auth moves from ADMIN_KEY (env var) to KV-stored admin-scoped keys, prevent a caller from revoking their own keyHash. Requires the auth result to include the caller's keyHash, which it currently does not." Security-adjacent. |

That is the **only** TODO/FIXME/HACK/XXX in non-vendor first-party code.
The vendored `src/vendor/autoconsent.playwright.js:3608` and
`src/vendor/autoconsent-script.js` carry upstream TODOs; these are vendor
drift to be picked up via the autoconsent update pipeline (Phase 0088), not
project debt.

`packages/verify/node_modules/**/*` TODOs are transitive deps inside a
checked-in `node_modules` tree under `packages/verify/`. Worth flagging
*structurally*: a `node_modules` tree is committed under
`packages/verify/`, presumably because the verify CLI ships as a
distributable. That is normal for a published npm package, but it does
mean `packages/verify/node_modules/` is reachable to project-wide greps
and will pollute future `TODO` sweeps unless excluded.

### `@deprecated` annotations still in production source

| Location | Note |
|---|---|
| `src/db.js:379` `setTenantTier(...)` | "Tier-based billing is replaced by usage-based billing (payment_method_added_at). Use billing functions … for new billing logic." Function still exported. |
| `src/quotas.js:12` `DEFAULT_TIER` | "Use FREE_CAPTURE_LIMIT instead. Kept for test backward compatibility until Phase 6." |
| `src/quotas.js:16-17` `TIER_QUOTAS` | "Use FREE_CAPTURE_LIMIT instead. Kept for test backward compatibility until Phase 6." |

These are internal-only deprecations (no API surface), but they constitute
"code retained for tests" debt. The "Phase 6" reference is unanchored —
the evolution log uses 4-digit phase IDs (currently up through 0107), so
the comment likely predates the renumbering and should be reconciled.

---

## Large Files (potential debt)

`find src -name '*.js' -o -name '*.ts' | grep -v vendor | xargs wc -l | sort -rn | head -20`

| Lines | File | Note |
|------:|------|------|
| 2544 | `src/index.js` | Main Worker entry / route map. Already past the 1500-line marker that backlog #0085 used as a refactor trigger. |
| 2363 | `src/ui/ui-css.js` | Concatenated CSS as a JS string. Inert size; not logical complexity. |
| 2131 | `src/db.js` | Single D1 access module. Likely needs splitting by domain (tenants/captures/keys/billing/notifications). |
| 1349 | `src/mcp.js` | At the threshold (~1500) called out in backlog #0085 for shared-business-logic extraction. |
| 989 | `src/ui/ui-settings.js` | Large dashboard view module. |
| 927 | `src/ui/ui-diff.js` | Diff view; large because of pixel-diff client. |
| 908 | `src/ui/ui-billing.js` | Hosts the broken `buildStatusBanner` (see Scope Collision above). |
| 886 | `src/capture.js` | Capture pipeline. |
| 861 | `src/ui/ui-detail.js` | Detail view; hosts the winning `buildStatusBanner`. |
| 845 | `src/verify-page.js` | Static verification page. |
| 736 | `src/ui/ui-notifications.js` | |
| 728 | `src/ui/ui-schedules.js` | |
| 713 | `src/account.js` | |
| 684 | `src/oauth.js` | GitHub OAuth flow. |
| 618 | `src/ui/ui-submit.js` | |
| 555 | `src/rfc3161.js` | TSA integration. |
| 520 | `src/billing.js` | |
| 513 | `src/certificate.js` | FRE 902(13) PDF generator. |
| 497 | `src/notifications.js` | |
| 495 | `src/admin.js` | Hosts the Self-revocation TODO. |

The seven-files-over-700-lines threshold from the briefing yields 13 files
in `src/` (including `ui-css.js` which is mostly CSS-as-string). The most
pressing structural debts are `src/index.js` and `src/db.js`.

---

## Schema / Migration Concerns

`migrations/`:

```
0001_initial_schema.sql           0010_share_tokens.sql
0002_usage_counters.sql           0011_eidas.sql
0003_webhooks.sql                 0012_billing_index.sql
0004_github_oauth.sql             0013_drop_share_tokens.sql
0005_tenant_tiers.sql             0014_notification_preferences.sql
0006_billing.sql                  0015_change_summary.sql
0007_schedules.sql                0016_email_verification.sql
0008_metering.sql                 0017_invoice_cache.sql
0009_threat_check.sql
```

Observations:

1. **Forward-only migrations.** No `down`/rollback files exist. This is
   typical for D1 / Cloudflare Workers projects but means schema rollback
   in production requires hand-written compensating migrations. Combined
   with the absence of automated D1 backups (backlog #149) it amplifies
   the blast radius of a bad migration.
2. **One pair of "migration hygiene" markers worth knowing about:**
   - `0005_tenant_tiers.sql` adds the `tier` column and is now effectively
     deprecated (see `src/db.js:379` `setTenantTier` `@deprecated`,
     `src/quotas.js:12,16` `DEFAULT_TIER` / `TIER_QUOTAS` `@deprecated`).
     The column likely lingers; no migration drops it.
   - `0010_share_tokens.sql` was reverted by `0013_drop_share_tokens.sql`
     during the Phase 0075 access-model simplification. This is healthy —
     a real "create then drop" trail in version control rather than an
     edit-in-place — but it does mean the table actually existed in
     production for a window.
3. **`docs/INTERNALS.md` is hand-maintained and dated** ("Last verified:
   2026-03-26"). Phases 0093 (admin dashboard), 0095 (TOCTOU fix),
   0102 (Pirsch), 0105 (auto-investigate), 0107 (Stripe-authoritative
   billing) and migrations 0014–0017 have shipped since. INTERNALS drift
   is in the parking lot: *"[consider] Automated INTERNALS.md generation
   script — When D1 schema changes become frequent (>2 migrations per
   month) or staleness causes a dev incident"*.
4. **No CI check that wrangler bindings, INTERNALS.md, and `migrations/`
   stay in sync.** Schema drift is detectable only by reading.

---

## Security-Adjacent Notes

1. **GitGuardian config (`.gitguardian.yml`)** explicitly ignores known
   test/example webhook secrets (one all-zeros, three repeated-byte
   patterns). This is a sensible allowlist, not a smell. Worth knowing
   about: any future CI alert on these specific values is suppressed.
2. **IP hashing.** `src/ip-hash.js` is the dedicated HMAC-SHA256 helper;
   `IP_HASH_SEED` is a runtime secret listed in OPERATIONS.md and
   INTERNALS.md. The helper has its own console.warn fallback (exempt
   per CLAUDE.md). Phase 0020 + Phase 0036 history suggests this surface
   has had eyes on it.
3. **Auth.** `src/auth.js` uses `timingSafeEqual` against the legacy
   `CAPTURE_API_KEY` (auth.js:213) and SHA-256 lookup for KV-stored
   per-tenant keys. Documented design: revoked KV keys are hard-rejected
   and do **not** fall through to legacy; KV/D1 I/O failures fail loudly
   (500) instead of falling through. The legacy fallback path's continued
   existence is the main residual risk (see Fragile Areas #3).
4. **Admin auth lacks self-revocation protection** (`src/admin.js:210`).
   Operators with `ADMIN_KEY` can mass-delete keys including the active
   tenant's. Non-issue while `ADMIN_KEY` is a single shared secret;
   becomes a real concern once admin scope moves to per-key.
5. **Share-token access removed.** Phase 0075 / migration 0013 removed
   share tokens; individual capture endpoints now rely on 128-bit IDs as
   capability tokens. Backlog parking flags two open considerations:
   *"Rate limiting on public capture metadata/status endpoints"* and
   *"X-Robots-Tag: noindex on capture endpoints"* — both deferred until
   abuse is observed. `grep` confirms no `X-Robots-Tag` header is set in
   `src/`.
6. **Stripe webhooks.** Verified by signature with event dedup in KV
   (per CHANGELOG 0.6.0 entry). No issue identified, just naming for the
   risk register.

---

## Open Backlog Themes

Summary of items still active in `docs/backlog.md` (not struck through):

- **Public capture endpoint hardening** — rate-limit unauth metadata, add
  `X-Robots-Tag: noindex`, audit error-field exposure, test bad creds on
  public endpoint. All deferred-until-observed.
- **Signing / legal** — eIDAS production rollout work (verify Sectigo URL,
  provision `QUALIFIED_TSA_AUTH` secrets, dedicated eIDAS test suite),
  plus speculative items (HSM-backed keys, OIDC trusted publishing for
  npm).
- **Capture fidelity** — E2E staging CMP test, distinguishing timeout vs
  failed in consent API, screenshot-height cap configurability, viewport
  parameterization, WACZ `captureQuality` field.
- **Webhooks (R27 extensions)** — replay/redelivery API, PATCH for
  active-toggle, DLQ Coralogix alert, `VERIFICATION_BASE_URL` env-var
  enforcement.
- **Notifications (R36 extensions)** — email-verification send-click flow,
  Resend bounce-webhook handler, digest-frequency config, SMS/push,
  provisioning `RESEND_API_KEY` secrets.
- **MCP (R15 extensions)** — extract shared business logic when mcp.js
  exceeds ~1500 lines (currently 1349; very close).
- **Operations** — D1 backups + DR (#149) before first paying customer,
  Coralogix DLQ alert, queue-architecture docs update, fork onboarding
  checklist, cross-doc anchor lint, INTERNALS.md auto-gen script,
  Coralogix MCP in CI, resolve-to-GitHub-comment for auto-investigation.
- **Product features** — diff unit/integration tests, screenshot
  similarity score in API, paywall/accept-only CMP handling (#156),
  embed Stripe payment form (#147), fetch-based capture for non-HTML
  resources (#143).
- **Stripe billing extensions** — daily full-refresh invoice cache for
  inactive tenants, eIDAS line items in invoice cache.
- **CI/CD** — preview deployments on PRs, Durable Object session
  coordinator, Cloudflare Containers, Chromium binary caching, promote
  integration tests to required check, deploy-version check in smoke
  test, smoke response-time assertion, automatic rollback on smoke
  failure, `queue_consumer_no_wait_for_wait_until` flag (#159).
- **Web UI** — E2E Playwright browser tests (dashboard + OAuth),
  AbortController for auth validation timeout, operator tenant linking
  (manual D1 SQL today), additional OAuth providers, OG image for
  landing.
- **Docs** — OG image, ghost-button border contrast, FAQ/JSON-LD drift
  CI check, DMCA takedown FAQ, landing page title-tag eval.

The active backlog (Acts 1–3) is mostly closed out. What remains is a
mature parking lot of conditional items, almost all gated on observed
events ("when a user reports", "when abuse is observed"), which is itself
healthy — but means there is no clear "next mandatory" item.

---

## Deprecations In Flight

### Per `DEPRECATION-POLICY.md`

The policy itself is in place (RFC 9745 + RFC 8594 headers, 6-month
minimum, 30-day emergency for security). `openapi.yaml` declares the
`Deprecation`, `Sunset`, and `Link` response-header schemas
(openapi.yaml:121, :131) but `grep -nE 'deprecated:\s*true' openapi.yaml`
returns zero hits — **no operation is currently flagged as deprecated**.

### Per `CHANGELOG.md`

The most recent removal-grade change was in 0.8.0 (2026-03-23):
> *Removed: Share token endpoints (`POST /v1/captures/{id}/share`,
> `DELETE /v1/captures/{id}/share/{tokenId}`) — access model simplified
> to public individual captures and authenticated list (#174); also
> `shareToken` query parameter on `GET /v1/captures/{id}` and `tokens`
> array from capture metadata responses.*

Per the policy this should have followed the 6-month deprecation
lifecycle. Two interpretations:
- The removal predates the deprecation policy itself (1.0.0 was tagged
  2026-03-25, two days *after* 0.8.0 shipped) — so it was technically
  pre-1.0 and the policy did not yet apply.
- This is the only "interesting" gap. Everything since 1.0.0 has been
  additive per the CHANGELOG.

### Internal-only `@deprecated`

Already enumerated under TODO/FIXME/HACK above
(`src/db.js:379 setTenantTier`, `src/quotas.js:12 DEFAULT_TIER`,
`src/quotas.js:16 TIER_QUOTAS`). All three are kept "for test backward
compatibility until Phase 6" — that comment's phase number is stale
relative to the project's current 4-digit phase numbering.

### Live legacy surface

`CAPTURE_API_KEY` is described in `OPERATIONS.md` as legacy/optional and
is implemented as a fallback in `src/auth.js:212-228`. There is no
`Deprecation` header on responses authenticated via the legacy path; the
migration is operator-driven via Coralogix (`security.legacy_auth_used`)
rather than user-facing headers. Not a policy violation (it is an auth
mechanism, not an API surface), but it is the largest piece of "to be
retired" code currently in production.
