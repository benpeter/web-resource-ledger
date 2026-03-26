# Domain Plan Contribution: api-design-minion

## Recommendations

### 1. The issue description has inaccuracies -- correct before diagramming

**Share links do not exist.** The issue describes `POST /v1/captures/{id}/share` producing a `wrl_share_xxx` token. No such endpoint, handler, or token format exists anywhere in the codebase. Grep for `wrl_share`, `share`, and `POST.*share` across all source files returned zero matches on share-link functionality. The verify endpoint (`GET /v1/verify/{captureId}`) is public (rate-limited, no auth), so there is no need for share tokens -- anyone with the capture ID can verify. The diagrams must not include share links.

**Batch captures are missing from the issue.** `POST /v1/captures/batch` is a real endpoint (route line 69) and represents a distinct interaction pattern (array of URLs in, array of capture IDs out). It should appear in the tenant flow diagram.

**Diff endpoint is missing.** `GET /v1/captures/{baseId}/diff/{targetId}` (route line 76) compares two captures. This is a tenant-facing flow relevant to scheduled capture use cases (detecting changes over time).

**Certificate endpoint is missing.** `GET /v1/captures/{captureId}/certificate` (route line 75) generates a signed PDF certificate for legal evidence use (FRE 902(13)). This is a verifier-adjacent flow and should be represented.

**Billing flows are missing.** `POST /v1/billing/checkout` and `POST /v1/billing/portal` (route lines 120-121) plus `POST /v1/stripe/webhook` (line 123) form a complete billing lifecycle. This is a tenant self-serve flow.

**Notification/email flows are missing.** Notification preferences (`GET/PUT /v1/account/notifications`), email verification (`GET/POST /v1/notifications/verify-email`), unsubscribe (`GET/POST /v1/notifications/unsubscribe`), and weekly digest (cron-triggered) form a distinct subsystem.

### 2. Complete endpoint inventory (routes vs. issue vs. OpenAPI)

| Endpoint | In Issue | In OpenAPI | In Routes | Notes |
|---|---|---|---|---|
| **Auth** | | | | |
| `GET /auth/login` | Yes | No | Yes | OAuth PKCE initiation |
| `GET /auth/callback` | Yes | No | Yes | OAuth callback |
| `POST /auth/logout` | Implied | No | Yes | Session teardown |
| `GET /auth/session` | No | No | Yes | Session validation |
| **Captures** | | | | |
| `POST /v1/captures` | Yes | Yes | Yes | |
| `POST /v1/captures/batch` | No | Yes | Yes | **Missing from issue** |
| `GET /v1/captures` | No | Yes | Yes | List captures (pagination) |
| `GET /v1/captures/{id}/status` | Yes | Yes | Yes | |
| `GET /v1/captures/{id}` | Yes | Yes | Yes | |
| `GET /v1/captures/{id}/artifacts/{name}` | Implied | Yes | Yes | |
| `GET /v1/captures/{id}/certificate` | No | Yes | Yes | **Missing from issue** |
| `GET /v1/captures/{baseId}/diff/{targetId}` | No | Yes | Yes | **Missing from issue** |
| **Verification** | | | | |
| `GET /v1/verify/{captureId}` | Yes | Yes | Yes | |
| `GET /.well-known/signing-key(s)` | No | Yes | Yes | Public key discovery |
| **Share** | | | | |
| `POST /v1/captures/{id}/share` | Yes | **No** | **No** | **Does not exist** |
| **Account self-serve** | | | | |
| `GET /v1/account/first-key` | No | No | Yes | Onboarding flow |
| `POST /v1/account/first-key/ack` | No | No | Yes | Onboarding flow |
| `GET/POST /v1/account/keys` | Yes | No | Yes | |
| `DELETE /v1/account/keys/{hash}` | No | No | Yes | |
| `POST /v1/account/tos` | No | No | Yes | ToS acceptance |
| `GET /v1/account/usage` | No | Yes | Yes | |
| `GET/PATCH /v1/account/settings` | No | No | Yes | eIDAS opt-in lives here |
| `GET/PUT /v1/account/notifications` | No | Yes | Yes | Email preferences |
| `POST /v1/account/notifications/resend-verification` | No | No | Yes | |
| **Notifications (unauthenticated)** | | | | |
| `GET/POST /v1/notifications/unsubscribe` | No | Yes | Yes | Token-based |
| `GET/POST /v1/notifications/verify-email` | No | No | Yes | Token-based |
| **Webhooks** | | | | |
| `POST/GET /v1/webhooks` | Yes | Yes | Yes | |
| `DELETE /v1/webhooks/{id}` | No | Yes | Yes | |
| `POST /v1/webhooks/{id}/ping` | No | Yes | Yes | |
| **Schedules** | | | | |
| `POST/GET /v1/schedules` | No | Yes | Yes | **Missing from issue** |
| `GET/DELETE /v1/schedules/{id}` | No | Yes | Yes | **Missing from issue** |
| **Billing** | | | | |
| `POST /v1/billing/checkout` | No | No | Yes | **Missing from issue** |
| `POST /v1/billing/portal` | No | No | Yes | **Missing from issue** |
| `POST /v1/stripe/webhook` | No | No | Yes | Stripe event ingestion |
| **Admin** | | | | |
| `POST/GET /v1/admin/keys` | No | Yes | Yes | Infrastructure keys |
| `DELETE /v1/admin/keys/{hash}` | No | Yes | Yes | |
| `GET /v1/admin/usage` | No | Yes | Yes | |
| `POST /v1/admin/cache/purge` | No | No | Yes | |
| `GET/PUT /v1/admin/tenants/{id}/config` | No | No | Yes | |
| **Background** | | | | |
| Queue: capture processing | Implied | N/A | Yes | Workers Queue consumer |
| Queue: webhook dispatch + DLQ | No | N/A | Yes | |
| Queue: email dispatch + DLQ | No | N/A | Yes | |
| Cron: scheduled captures | No | N/A | Yes | `handleScheduledTick` |
| Cron: weekly digest | No | N/A | Yes | Monday 9:00 UTC |
| Cron: rescan | No | N/A | Yes | `RESCAN_CRON` |
| Cron: meter reporting | No | N/A | Yes | Hourly Stripe meter events |
| **Other** | | | | |
| `GET /ui` | No | No | Yes | Web dashboard |
| `GET /health` | No | Yes | Yes | |
| MCP handler | No | No | Yes | `handleMcp` |

### 3. Abstraction level guidance

**Architecture diagrams should show conceptual flows, not endpoint inventories.** The existing API Reference page already serves as the endpoint-level documentation. The diagrams should operate one level above that.

**Recommended groupings for the sequence diagram (User Interaction Flows):**

Rather than showing every endpoint, group into these interaction patterns:

1. **Onboarding flow**: OAuth login --> first-key generation --> ToS acceptance --> dashboard
2. **Capture lifecycle**: Create capture (single or batch) --> queue processing --> poll status --> retrieve result + artifacts
3. **Scheduled capture flow**: Create schedule --> cron tick --> automatic capture --> change detection (diff) --> webhook/email notification
4. **Verification flow**: Public verify endpoint --> 5 integrity checks --> certificate download
5. **Account management**: API key CRUD, settings (eIDAS opt-in), notification preferences, billing (checkout/portal)
6. **Webhook delivery**: Capture completes --> webhook queue --> delivery with retry --> DLQ on failure

**Recommended groupings for the flowchart (Capture Pipeline & Integrity Chain):**

Show the data flow through the system, not the HTTP layer:

1. **Ingestion**: HTTP request --> validation (URL, quota, rate limit, threat check) --> D1 row creation --> Queue enqueue --> 202 response
2. **Processing**: Queue dequeue --> Browser Rendering (headless Chromium) --> artifact collection (HTML, headers, screenshot, WACZ) --> hashing --> Ed25519 signing --> R2 storage --> D1 status update
3. **Integrity chain**: Content hash --> manifest hash --> signature --> verification (5 checks: existence, hash, signature, timestamp, R2 integrity)
4. **Optional paths**: eIDAS qualified timestamp (external TSA) --> timestamp token stored alongside signature
5. **Notifications**: Capture complete --> webhook dispatch queue --> HTTP delivery; email dispatch queue --> email delivery
6. **Scheduled captures**: Cron trigger --> D1 schedule lookup --> capture enqueue --> diff against previous --> change summary

### 4. What the diagrams should NOT include

- **Admin endpoints**: These are infrastructure-internal (key provisioning, cache purge, tenant config). They are not part of the tenant or verifier experience.
- **Individual endpoint paths**: The API Reference already covers this. Repeating `POST /v1/captures` in a sequence diagram adds noise. Use conceptual labels like "Create Capture" with a parenthetical reference to the endpoint.
- **MCP handler**: This is an integration interface, not a user flow. Omit from architecture overview.
- **Health check / favicon**: Infrastructure plumbing.

### 5. OpenAPI spec is incomplete

The OpenAPI spec is missing several routes that exist in `src/index.js`:
- All auth routes (`/auth/*`)
- Account key management, settings, ToS
- Billing routes
- Email verification
- First-key onboarding
- Admin tenant config and cache purge

This is worth noting but does not affect the diagram task. The diagrams should reflect reality (the routes table), not the spec.

## Proposed Tasks

1. **Remove share link flow from both diagrams.** The `POST /v1/captures/{id}/share` endpoint does not exist. The verify endpoint is public and needs no share token.

2. **Add scheduled capture flow to the sequence diagram.** This is a distinct tenant interaction pattern (create schedule, automatic captures, change detection via diff, notification delivery) that the issue completely omits.

3. **Add batch capture as a variant in the capture lifecycle.** Show it as an alternative entry point alongside single capture, converging at the queue processing step.

4. **Include certificate download in the verifier flow.** After verification succeeds, a verifier can download a signed PDF certificate -- this is the legal-evidence endpoint of the integrity chain.

5. **Show the notification subsystem in the pipeline flowchart.** After capture completion, two parallel paths: webhook dispatch queue and email dispatch queue. Both have retry logic and DLQ. This is a significant part of the system architecture.

6. **Show billing as a self-contained box in account management.** Stripe checkout creates a subscription, Stripe webhooks update tenant state, portal provides self-serve billing management. Keep it simple -- one box with three arrows.

7. **Use conceptual labels, not endpoint paths, as primary labels.** Reference endpoints in parentheses where helpful (e.g., "Create Capture (POST /v1/captures)") but keep the diagram readable at a conceptual level. The API Reference page is already the endpoint inventory.

## Risks and Concerns

1. **The issue's share link flow is fictional.** If someone implements the diagram as described in the issue, it will depict functionality that does not exist and may confuse users who try to find the endpoint. This must be caught before the diagrams are created.

2. **Diagram scope creep.** The system has 40+ routes, 3 queue consumers, 4+ cron jobs, and multiple subsystems (billing, notifications, schedules, webhooks). Trying to show everything in two diagrams will produce unreadable output. The groupings I recommended above are the right abstraction level -- resist the temptation to add more detail.

3. **OpenAPI drift.** The spec is significantly behind the implementation. If someone references the spec to build the diagrams, they will miss half the system. The route table in `src/index.js` (lines 64-124) is the authoritative source.

## Additional Agents Needed

None. The diagram implementation is a documentation/visualization task. The API design analysis above provides the factual foundation needed.
