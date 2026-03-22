## Security Review: R19 Documentation Site

**Verdict: ADVISE**

The site is low-risk by design -- static HTML, no user auth, no server-side logic, no user-submitted content. The plan's instinct to skip a dedicated security execution task is sound. The concerns below are narrow and addressable within the existing task assignments.

---

### Concerns

- [security]: Missing Content-Security-Policy and HSTS headers in the `_headers` file leaves the site without defense-in-depth against XSS and protocol downgrade.
  SCOPE: `site/_headers` (Task 1)
  CHANGE: Add to the `/*` block: `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'` and `Strict-Transport-Security: max-age=31536000; includeSubDomains`. The CSP allows `'unsafe-inline'` because the copy-to-clipboard snippet in Task 5 is an inline `<script>` tag and the design system uses inline style tokens -- a nonce-based CSP would require template changes. If Task 5 moves the script to a file, upgrade to `script-src 'self'`.
  WHY: Task 1's `_headers` currently lists only `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`. CSP is the primary control against injected scripts; HSTS prevents SSL stripping on first visit. Cloudflare Workers Static Assets does not inject these automatically.
  TASK: Task 1

- [security]: The OpenAPI data pipeline (`site/_data/api.js`) reads `openapi.yaml` and injects its content into Nunjucks templates via `{{ content | safe }}` -- the `safe` filter disables escaping. If `openapi.yaml` descriptions or examples contain HTML or script content, it renders unescaped into the API reference page.
  SCOPE: `site/_data/api.js` and `site/_includes/partials/endpoint.njk` (Task 2)
  CHANGE: Use Nunjucks default escaping (`{{ value }}` not `{{ value | safe }}`) for all string fields sourced from `openapi.yaml` (summaries, descriptions, parameter names, example values). Reserve `| safe` only for content that is already intentionally formatted as HTML by the template itself (e.g., rendered markdown blocks). The base layout already uses `{{ content | safe }}` for page body -- that is correct for 11ty's markdown output, but it must not be applied to spec-derived strings.
  WHY: `openapi.yaml` is a developer-controlled file, so the risk is low in the current setup, but the `_headers` CSP above is the safety net only if the template escaping is correct. The current plan's prompt does not explicitly require escaping discipline in the partials; the agent may reach for `| safe` for convenience to render descriptions that contain markdown.
  TASK: Task 2

- [security]: The deploy workflow uses a single `CLOUDFLARE_API_TOKEN` that is already scoped to the production Worker. The plan reuses this same token for the docs Worker without verifying its permission scope.
  SCOPE: `.github/workflows/deploy-docs.yml` (Task 4)
  CHANGE: Add a note in the Task 4 prompt that the `CLOUDFLARE_API_TOKEN` must have `Workers Scripts:Edit` and `Workers Routes:Edit` for the `wrl-docs` Worker specifically -- or confirm that the existing token already covers it. If the token currently has account-wide `Workers Scripts:Edit`, that is broader than needed. Ideal scope: resource-level token scoped to the `wrl-docs` Worker only. This is a configuration step, not a code change, and can be deferred, but the iac-minion prompt should acknowledge it rather than assuming the existing token "should have account-level Workers permissions" (current wording).
  WHY: The current prompt says "The CLOUDFLARE_API_TOKEN secret already exists and should have account-level Workers permissions" -- "should" is not verified. Account-level tokens grant deploy rights to every Worker, including the production WRL API. A leaked docs CI token becomes a prod deploy token.
  TASK: Task 4

- [security]: The `site/content/authentication.md` content guide instructs user-docs-minion to reference `src/auth.js` and `src/admin.js` directly for implementation details.
  SCOPE: Task 3 prompt, `site/content/authentication.md`
  CHANGE: Ensure the content agent understands it is writing *user-facing documentation*, not internal implementation notes. Specifically: the ADMIN_KEY is a secret injected via `wrangler secret put` -- the doc must describe this as "set by the operator" without exposing that it is an environment variable named `ADMIN_KEY` or hinting at its format. Similarly, the SHA-256 key hash used for DELETE must be described as an opaque identifier returned by the API, not as a derivable value. Review the generated content at the Task 3 approval gate for any detail that would help an attacker enumerate or brute-force admin credentials.
  WHY: Documentation that over-explains implementation details of the auth system is an information disclosure risk (OWASP A02). The `keyHash` field being SHA-256 of the raw key is already in the API spec, which is acceptable, but the auth docs should not add any detail beyond what the spec already exposes.
  TASK: Task 3 (approval gate)

---

### Items Confirmed Acceptable

- **Zone ID in wrangler.toml** (`9b1b321a3921da4741063f25d6935a74`): Zone IDs are non-secret identifiers. Cloudflare's own documentation cites them in public contexts. No action needed.
- **No user authentication on the docs site**: Correct for a public static site. No attack surface.
- **No server-side logic, no form inputs, no user-generated content**: The XSS surface is limited to the OpenAPI pipeline concern above.
- **Action pins**: All GitHub Actions pins match the existing `deploy-production.yml` pattern. No new unpinned actions introduced.
- **DNS configuration**: The custom domain route in `wrangler.toml` auto-creates a CNAME via Cloudflare. No zone-apex or NS record changes; HTTPS is automatic via Universal SSL. Acceptable.
- **No secrets in code examples**: The plan explicitly uses `YOUR_API_KEY` and `YOUR_ADMIN_KEY` as placeholders throughout all content guidance. Correct.
