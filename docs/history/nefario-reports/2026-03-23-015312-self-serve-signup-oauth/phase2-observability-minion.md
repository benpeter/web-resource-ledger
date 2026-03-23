# Domain Plan Contribution: observability-minion

## Recommendations

### 1. New Subsystem: "oauth"

The existing subsystems are `capture`, `security`, `admin`, `webhook`, `usage`, and `signing`. OAuth events span identity, sessions, and self-serve key management -- a new category distinct from the operator `admin` subsystem. Introduce `"oauth"` as the subsystem for all self-serve signup, login, session, and account management events.

Rationale: The `admin` subsystem represents infrastructure-secret-authenticated operator actions. Self-serve actions are user-initiated via session cookies. Mixing them in the same subsystem destroys the ability to filter by actor type in Coralogix. Keeping them separate enables independent alerting thresholds -- you expect high volume on `oauth` events during a Product Hunt launch day, but a spike in `admin` events is suspicious.

### 2. Event Naming Convention

Extend the existing `subsystem.action` naming pattern. All new events use the `oauth.*` prefix:

**OAuth Flow Events:**

| Event | Severity | Fields | When |
|---|---|---|---|
| `oauth.login_start` | 3 (info) | `cip`, `provider: 'github'` | User clicks "Sign in with GitHub", server generates state and redirects. Proves the redirect was issued, not forged. |
| `oauth.callback_success` | 3 (info) | `cip`, `provider: 'github'`, `githubUserId` (integer, safe -- deterministic, not attacker-controlled), `tenantId`, `isNewUser` (boolean), `sessionIdPrefix` (first 8 chars of session ID hash) | Token exchange succeeded, GitHub identity resolved, session issued. |
| `oauth.callback_fail` | 5 (error) | `cip`, `provider: 'github'`, `reason` (one of: `state_mismatch`, `token_exchange_error`, `github_api_error`, `missing_code`, `missing_state`) | Token exchange or identity retrieval failed. |
| `oauth.state_mismatch` | 5 (error) | `cip`, `provider: 'github'` | The OAuth state parameter did not match the stored value. This is a CSRF indicator -- every occurrence deserves attention. |
| `oauth.logout` | 3 (info) | `cip`, `tenantId`, `sessionIdPrefix` | User explicitly logs out. |

**Session Lifecycle Events:**

| Event | Severity | Fields | When |
|---|---|---|---|
| `oauth.session_create` | 3 (info) | `cip`, `tenantId`, `githubUserId`, `sessionIdPrefix`, `expiresAt` | New session row written to D1. Fires alongside `callback_success` but separated for schema clarity -- one is about OAuth protocol, the other about session state. |
| `oauth.session_validate` | DO NOT LOG | -- | This fires on every authenticated request. Logging it would create extreme volume for near-zero value. Instead, rely on the existing per-request auth logs and add `authMethod: 'session'` to distinguish session-authenticated requests from API-key-authenticated ones (see recommendation 4). |
| `oauth.session_expire` | 3 (info) | `tenantId`, `sessionIdPrefix`, `reason` (one of: `ttl_expired`, `explicit_logout`, `revoked`) | Session is invalidated. For TTL expiry, this fires when a request hits an expired session, not on a background sweep (Workers have no cron for this). |
| `oauth.session_reject` | 4 (warn) | `cip`, `sessionIdPrefix`, `reason` (one of: `not_found`, `expired`, `malformed_cookie`) | A request presented a session cookie that could not be validated. Distinct from auth_fail because the mechanism is different (cookie vs Bearer). |

**Tenant Provisioning Events:**

| Event | Severity | Fields | When |
|---|---|---|---|
| `oauth.tenant_create` | 3 (info) | `cip`, `tenantId`, `githubUserId`, `provider: 'github'` | A new tenant is auto-provisioned during first login. This is a business metric -- track signup rate. |
| `oauth.tenant_link` | 3 (info) | `cip`, `tenantId`, `githubUserId`, `provider: 'github'` | An existing operator-provisioned tenant is linked to a GitHub identity. This is operationally significant -- it means a pre-existing tenant just gained self-serve access. |
| `oauth.tos_accept` | 3 (info) | `cip`, `tenantId`, `githubUserId`, `tosVersion` | Terms of Service accepted. `tosVersion` is a controlled string (e.g., `"2026-03-23"`) set in code, not from user input. Legally relevant -- must be retained. |

**Self-Serve Key Management Events:**

| Event | Severity | Fields | When |
|---|---|---|---|
| `oauth.key_create` | 3 (info) | `cip`, `tenantId`, `keyHashPrefix`, `scopes`, `keyName`, `authMethod: 'session'` | User creates an API key via account settings. Distinct from `admin.key_create` by `authMethod`. |
| `oauth.key_revoke` | 3 (info) | `cip`, `tenantId`, `keyHashPrefix`, `keyName`, `scopes`, `authMethod: 'session'` | User revokes an API key. |
| `oauth.key_list` | 3 (info) | `cip`, `tenantId`, `count`, `authMethod: 'session'` | User views their API keys. Lower value than mutations, but useful for understanding UI engagement. |
| `oauth.key_limit_reached` | 4 (warn) | `cip`, `tenantId`, `currentCount`, `maxKeys` | User attempts to create a key but has hit the per-tenant limit. Signals either a real need for more keys or an abuse attempt. |

### 3. Fields to NEVER Log (Extending Existing INVARIANT)

Add to the NEVER LOG list in `log.js` docstring:
- **Raw GitHub access tokens** -- ephemeral but still credentials
- **Raw session cookie values** -- use `sessionIdPrefix` (first 8 chars of SHA-256 hash of session ID) for correlation
- **GitHub usernames in freeform** -- only log `githubUserId` (integer) which is immutable and bounded. Usernames can change and may contain unexpected characters. If username must be logged for readability, validate it against GitHub's `^[a-zA-Z0-9-]{1,39}$` pattern first, then it satisfies the INVARIANT (bounded character set, injection-safe).
- **OAuth authorization codes** -- transient, but never safe to persist
- **Raw state parameter values** -- log only whether state matched or mismatched

### 4. Integrate `authMethod` Across All Existing Log Events

The existing events (`security.auth_fail`, `security.rate_limit`, `capture.accepted`, etc.) already include `authMethod` with values `'kv'`, `'legacy'`, and `'admin_key'`. The new session-based auth path must set `authMethod: 'session'` on these same events. This is critical -- it means every existing Coralogix query that groups by `authMethod` automatically shows OAuth session traffic without query changes.

Specifically, when a session-authenticated user calls endpoints like `GET /v1/captures`, the auth result object should include the same shape as the existing `verifyApiKey` return: `{ ok: true, tenantId, scopes, keyName: null, keyHashPrefix: null, authMethod: 'session' }`. This way, the existing `security.auth_fail`, `security.rate_limit`, and `capture.*` log lines work unchanged -- they just get a new `authMethod` value.

### 5. Rate Limiting Events for OAuth Endpoints

OAuth endpoints (`/auth/github`, `/auth/github/callback`, `/auth/logout`) need their own rate limiter to prevent:
- Login flood (redirect storm hitting GitHub)
- Callback abuse (replaying or brute-forcing authorization codes)
- Logout CSRF / denial-of-service

Log these with the existing `security.rate_limit` event pattern:
```
{ event: 'security.rate_limit', limiter: 'oauth_per_ip', responseStatus: 429, cip }
```

This reuses the existing event name and just adds a new `limiter` value, keeping Coralogix alert rules that match `event = 'security.rate_limit'` functional.

### 6. Proposed Alert Rules (Coralogix)

**A1: OAuth State Mismatch Spike**
- Trigger: `event = 'oauth.state_mismatch'` count > 5 in 5 minutes
- Severity: Critical
- Rationale: State mismatches indicate CSRF attacks or a misconfigured OAuth redirect. More than 5 in 5 minutes is not organic (users rarely fail OAuth this way).
- Runbook: Check if the state cookie is being lost (browser settings, CDN stripping cookies). If all from one `cip`, likely targeted CSRF attempt.

**A2: OAuth Token Exchange Failure Rate**
- Trigger: `event = 'oauth.callback_fail'` count > 10 in 10 minutes
- Severity: Warning
- Rationale: Could indicate GitHub OAuth app misconfiguration (wrong client_secret), GitHub API degradation, or an attacker probing the callback endpoint.
- Runbook: Check GitHub status page, verify GITHUB_CLIENT_SECRET hasn't rotated without updating the Worker secret, check if callback_fail reasons cluster on one error type.

**A3: New Tenant Creation Anomaly**
- Trigger: `event = 'oauth.tenant_create'` count > 20 in 1 hour
- Severity: Warning
- Rationale: Normal early-stage growth is single-digit signups per day. 20+ in an hour suggests either a viral moment (good -- but check infra capacity) or automated account creation (bad -- check for bot patterns in `cip` distribution).
- Runbook: Check `cip` distribution. If diverse, likely organic -- celebrate. If concentrated, potential abuse -- consider adding CAPTCHA or GitHub account age check.

**A4: Session Rejection Spike**
- Trigger: `event = 'oauth.session_reject'` count > 20 in 5 minutes
- Severity: Warning
- Rationale: High session rejection rates indicate either a deployment that broke session validation (key rotation without grace period) or session forgery attempts.
- Runbook: Check if a deployment just happened. If yes, verify session signing key continuity. If no recent deploy, check if rejections cluster on one `cip`.

**A5: Self-Serve Key Creation Anomaly**
- Trigger: `event = 'oauth.key_create'` count > 10 in 10 minutes from same `tenantId`
- Severity: Warning
- Rationale: A single tenant creating 10+ keys in 10 minutes is not normal usage. Could indicate a compromised session or an attempt to stockpile keys before detection.
- Runbook: Check the tenant's key count via admin API. If keys are being created and immediately used for capture, may be a legitimate automation setup. If keys are idle, investigate session validity.

### 7. Log Volume and Cost Considerations

**Volume estimates for new events:**

| Event Category | Expected Volume | Cost Impact |
|---|---|---|
| `oauth.login_start` / `callback_success` / `callback_fail` | Low (< 100/day early stage) | Negligible |
| `oauth.session_create` / `session_expire` / `logout` | Low (1:1 with logins) | Negligible |
| `oauth.session_reject` | Near-zero in normal operation | Negligible |
| `oauth.key_create` / `key_revoke` / `key_list` | Low (< 50/day early stage) | Negligible |
| `oauth.tenant_create` / `tenant_link` / `tos_accept` | Very low (< 10/day early stage) | Negligible |

**The one event NOT to log:** `oauth.session_validate` -- session validation happens on every authenticated page load and API call from the UI. At scale this could be 100x the volume of all other OAuth events combined. The session validation outcome is already visible through the existing `authMethod` field on per-request logs. Explicitly documenting this as a "DO NOT LOG" decision prevents future developers from adding it.

**Retention:** All `oauth.*` events should be at Coralogix TCO medium priority initially. If volume stays low (< 500 events/day), promote to high priority for real-time alerting. `oauth.tos_accept` events have legal retention requirements -- these should be high priority and exempt from any automated retention reduction.

### 8. Correlation Strategy

**Session-to-request correlation:** The `sessionIdPrefix` (first 8 chars of hashed session ID) should appear in both session lifecycle events and in a new field on per-request auth logs when `authMethod === 'session'`. This enables: "show me all requests that used this session" as a Coralogix query.

**GitHub-user-to-tenant correlation:** Log `githubUserId` on session creation and tenant provisioning. This enables: "show me all tenants linked to this GitHub user" and "show me the login history for the tenant that owns this capture."

**Unified flow tracing:** A full self-serve signup flow creates this event chain:
1. `oauth.login_start` (cip)
2. `oauth.callback_success` (cip, githubUserId, tenantId, isNewUser=true, sessionIdPrefix)
3. `oauth.tos_accept` (cip, tenantId, githubUserId, tosVersion)
4. `oauth.tenant_create` (cip, tenantId, githubUserId)
5. `oauth.session_create` (cip, tenantId, githubUserId, sessionIdPrefix)
6. `oauth.key_create` (cip, tenantId, keyHashPrefix, authMethod=session)

All correlated by `cip` (same IP, same day) and `tenantId` (after creation). This chain is queryable in Coralogix with `tenantId = 'xxx' AND subsystemName = 'oauth'` sorted by timestamp.

### 9. Implementation Pattern

Follow the existing fire-and-forget pattern exactly. Every log call must:
1. Use `ctx.waitUntil(log(env, severity, 'oauth', { ... }) ?? Promise.resolve())`
2. Never block the response -- the `?? Promise.resolve()` handles the case where log() returns undefined (missing Coralogix config)
3. Compute `cip` via `computeCip(env, clientIp)` before logging -- never log raw IP
4. Destructure and pick specific fields from auth results -- never pass the full auth object

The OAuth handler code should look structurally identical to existing `admin.js` handlers:
```js
const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
const cip = await computeCip(env, clientIp);
// ... OAuth logic ...
ctx.waitUntil(log(env, 3, 'oauth', {
  event: 'oauth.callback_success',
  cip,
  provider: 'github',
  githubUserId: userInfo.id,       // integer, safe
  tenantId,
  isNewUser,
  sessionIdPrefix: sessionHash.slice(0, 8),
}) ?? Promise.resolve());
```

## Proposed Tasks

### T1: Add `"oauth"` subsystem to log.js documentation
- Update the JSDoc on `log()` to list `"oauth"` as a valid subsystem
- Add `oauth.*` event names to the NEVER LOG section for OAuth-specific sensitive values (tokens, codes, raw session cookies)
- Effort: XS

### T2: Define log event constants or a registry
- Currently event names are string literals scattered across handlers. For the new OAuth events, consider a single `events.js` or a constants block at the top of the OAuth handler module that documents all event names. This prevents typos (e.g., `oauth.callbck_success`) that silently break alert rules.
- Not a refactor of existing events -- just the new ones. Optional but recommended.
- Effort: S

### T3: Implement structured logging in OAuth flow handlers
- Each handler (login start, callback, logout) calls `log()` with the event schema defined above
- Follows the `ctx.waitUntil(log(...) ?? Promise.resolve())` pattern
- Includes `cip` computation, `sessionIdPrefix` derivation, field destructuring
- Must be coordinated with the oauth-minion and security-minion implementations
- Effort: M (volume of handlers, but each is straightforward)

### T4: Implement structured logging in session middleware
- Session validation on every request: add `authMethod: 'session'` and `sessionIdPrefix` to the auth result object
- Session rejection: log `oauth.session_reject` with reason codes
- Session expiry: log `oauth.session_expire` when a request encounters an expired session
- Effort: S

### T5: Implement structured logging in self-serve key management handlers
- `oauth.key_create`, `oauth.key_revoke`, `oauth.key_list`, `oauth.key_limit_reached`
- Follows the pattern in existing `admin.js` handlers
- Effort: S

### T6: Implement structured logging for tenant provisioning and ToS
- `oauth.tenant_create`, `oauth.tenant_link`, `oauth.tos_accept`
- Effort: XS

### T7: Configure Coralogix alert rules
- Five alerts defined in section 6 above
- Requires Coralogix API or UI configuration (not code)
- Should be set up after the events are shipping to staging
- Effort: S

### T8: Add `authMethod: 'session'` to existing auth flow
- The new `verifySession()` function (or equivalent) must return the same shape as `verifyApiKey()` so that all downstream log calls work unchanged
- This is a contract requirement, not an observability-only task -- but observability depends on it
- Effort: S (coordinated with oauth-minion)

## Risks and Concerns

### R1: GitHub Username Logging and the INVARIANT
The `githubUserId` (integer) is safe to log -- it is deterministic, bounded, and cannot contain injection payloads. However, if any handler decides to log the GitHub username (string), it must be validated against `^[a-zA-Z0-9-]{1,39}$` first to satisfy the `log.js` INVARIANT. The safest path is to log only the integer ID and never the username. If the username is needed for operational readability, the validation must be explicit and visible in code review.

### R2: Session ID Prefix Collision
Using 8 hex chars (4 bytes) of a SHA-256 hash gives 2^32 possible prefixes. With < 1,000 active sessions, collision probability is negligible. However, `sessionIdPrefix` is for log correlation, not security -- never use it for session lookup or validation.

### R3: Legal Retention for ToS Acceptance
`oauth.tos_accept` events carry legal weight. If Coralogix retention is set to 30 days, these events will be lost. Either: (a) ensure Coralogix retention for `oauth.tos_accept` is extended to the legal requirement (typically 7 years), or (b) treat the D1 `tos_accepted_at` column as the system of record and the log as a supplementary audit trail. Recommendation: D1 is the system of record. The log provides an independent audit trail with `cip` context that D1 does not have.

### R4: Volume Spike on Launch Day
If WRL gets featured and 1,000 users sign up in a day, the OAuth event volume is still only ~6,000 events (6 events per signup flow). This is negligible relative to the existing capture event volume. No volume concern.

### R5: Sensitive Data Leak Path via Error Messages
When the GitHub token exchange fails, the HTTP response from GitHub might contain error details. These must NOT be logged verbatim -- they could contain the authorization code or partial token in error context. Log only the categorized `reason` code (e.g., `token_exchange_error`), not the raw error body. If more detail is needed, log a truncated error message (`.slice(0, 128)`) following the existing pattern in `auth.js` for D1 errors.

### R6: Cookie Value in Console Logs
Cloudflare Workers runtime may include request headers in `console.error` stack traces during unhandled exceptions. The session cookie is in the `Cookie` header. Ensure the global error handler (if any) does not dump full request headers. The existing code does not do this, but it is worth noting as a constraint for the new handler implementation.

### R7: No `oauth.session_validate` Event
Explicitly documenting this as a non-event. Future developers may add session validation logging "for completeness" without realizing the volume implications. The decision to NOT log successful session validations should be documented in `log.js` or in a comment near the session validation function.

## Additional Agents Needed

- **security-minion**: Must validate that `sessionIdPrefix` derivation (SHA-256 hash of session ID, first 8 chars) does not leak information that aids session forgery. Must confirm that logging `githubUserId` does not create a privacy concern under the project's data handling policy.
- **data-minion**: The `sessionIdPrefix` field requires the session storage to have a session ID that can be hashed. The schema design must include a session ID column (not just a cookie value) so that the hash can be computed server-side for logging.
- **oauth-minion**: Must emit the correct log calls at each stage of the OAuth flow. The event schema defined here is the contract -- the OAuth handler implementation must produce these exact field sets.
- **test-minion**: Must verify that (1) no sensitive values (tokens, codes, raw session cookies) appear in log output, (2) all events fire with the correct fields, (3) the `authMethod: 'session'` value propagates correctly through existing log events. Mock the `log()` function to capture calls and assert on field presence/absence.
