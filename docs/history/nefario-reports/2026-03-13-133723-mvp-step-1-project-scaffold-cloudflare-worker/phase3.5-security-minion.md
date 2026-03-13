# Security Review: MVP Step 1 -- Project Scaffold and Cloudflare Worker

## Verdict: ADVISE

---

- [security]: 404 fallback reflects user-controlled method and pathname verbatim into the error response body
  SCOPE: `src/index.js` -- `fetch` handler fallback at `problemResponse(404, \`No route matches ${request.method} ${url.pathname}\`)`
  CHANGE: Replace the reflected pathname with a static message. Use: `problemResponse(404, 'The requested resource does not exist.')` The method and path provide no value to a legitimate client (they know what they requested) and echo attacker-controlled input into the response body. This also sets the wrong convention: `src/responses.js` explicitly documents "Never leak internals" but the first call site in `src/index.js` directly contradicts that rule by reflecting `url.pathname`. Later steps adding path-parameter routes (e.g., `/captures/:id`) will copy this pattern and could echo sensitive resource IDs into 404 bodies.
  WHY: Reflected user input in error responses is an information disclosure vector (OWASP A02, CWE-209). More practically, the convention established in Step 1 will be copied across Steps 2-8. Fixing it now costs one line; fixing it after 7 more steps means auditing every error call site.
  TASK: Task 2 (api-design-minion, `src/index.js`)

- [security]: `wrangler` devDependency uses a floating caret range (`^4.73.0`) while the build tool has privileged access to deploy credentials and `.dev.vars` secrets
  SCOPE: `package.json` -- `"wrangler": "^4.73.0"` in devDependencies
  CHANGE: Pin wrangler to an exact version (`"wrangler": "4.73.0"`) consistent with how vitest is pinned. Wrangler is not a library -- it is the deployment tool. A compromised or supply-chain-attacked minor release under a caret range would have write access to the Cloudflare account and read access to any local secrets in `.dev.vars`. The rationale for pinning vitest exactly ("eliminates surprise breakage") applies equally to wrangler.
  WHY: Build and deployment tools are high-value supply chain targets (OWASP A03). Exact pinning for all three devDependencies is consistent with the plan's own stated rationale for pinning vitest. The fallback version change procedure is equally simple for wrangler.
  TASK: Task 1 (iac-minion, `package.json`)

---

## Notes (informational, no action required)

**Response header security posture**: The plan explicitly defers `X-Content-Type-Options`, `X-Frame-Options`, HSTS, and CSP to Step 8. This is acceptable for a scaffold. The `headers` spread in `jsonResponse` and `problemResponse` ensures no structural change is needed when Step 8 adds them. The deferral is intentional and the mechanism to add them later is already in place.

**`.dev.vars` in `.gitignore`**: Correctly excluded. No `.dev.vars.example` template is needed at Step 1 since no secrets are configured yet. Step 1 has no API key auth surface.

**Route dispatch bypass**: The regex-based dispatch in `src/index.js` matches on `url.pathname` after `new URL(request.url)` parsing. Cloudflare Workers normalize URL parsing before the fetch handler receives the request, so path traversal sequences (`../`, `%2F`, URL-encoded characters) are resolved by the platform before reaching the regex. No bypass vector exists at the dispatcher level for Step 1's single static route.

**Binding configuration**: Omitting resource IDs from `wrangler.toml` bindings (`BUCKET`, `KV`, `BROWSER`) is a dev-ergonomics choice. In production deployment, wrangler will require real IDs and the developer will need to bind to specific provisioned resources. This is not a security gap in Step 1 -- it is a deployment concern for a later step. The important thing is that no binding credentials or account IDs appear in the committed `wrangler.toml`.
