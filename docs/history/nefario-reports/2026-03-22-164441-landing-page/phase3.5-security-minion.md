## Security Review: WRL Landing Page

### Verdict: ADVISE

The plan is sound overall. No blockers. Two medium-severity issues warrant attention before implementation begins; the rest are low/informational.

---

### Findings

#### MEDIUM: CSP missing `object-src` and `base-uri` directives

- **Location**: `landing/_headers` (proposed CSP in Task 2 prompt)
- **Description**: The proposed CSP is `default-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; script-src 'none'`. The `object-src` directive is not set, so it falls through to `default-src 'self'`, which allows `<object>`, `<embed>`, and `<applet>` tags to load resources. The `base-uri` directive is also absent, allowing an injected `<base>` tag to redirect relative URLs. Neither is exploitable on a pure static page with no user-generated content, but both are trivial to close and are expected by CSP scanners (securityheaders.com will flag them).
- **Impact**: Low practical risk on this page. Non-zero in case of future content additions.
- **Remediation**: Add both directives:
  ```
  Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; script-src 'none'; object-src 'none'; base-uri 'self'
  ```

#### MEDIUM: `CLOUDFLARE_API_TOKEN` secret is shared across Workers

- **Location**: `.github/workflows/deploy-landing.yml` — uses `${{ secrets.CLOUDFLARE_API_TOKEN }}`, same secret as `deploy-docs.yml`
- **Description**: Both workflows use a single API token with edit permissions on Workers. A compromise of one workflow (e.g., a supply chain attack on a pinned action) gains write access to both the docs Worker and the landing Worker. The plan's own Risk #2 flags scope as a concern but only asks to "verify and expand if needed" — the mitigation should go the other direction (narrow, not expand).
- **Impact**: If `CLOUDFLARE_API_TOKEN` is compromised, an attacker can overwrite both deployed sites. Each Worker being on a different domain (docs vs apex) amplifies blast radius.
- **Remediation**: Create a separate, resource-scoped token for `wrl-landing` with permissions limited to that Worker only (Workers Scripts:Edit, Workers Routes:Edit for `wrl-landing` only). Store it as `CLOUDFLARE_API_TOKEN_LANDING`. Reference this in the deploy-landing.yml. Document the scoping requirement in the workflow comment, mirroring the comment already present in deploy-docs.yml. This follows least-privilege and bounds the blast radius.

---

### Informational

**Zone ID in wrangler.toml**: The plan does not include the zone ID directly in `wrangler.toml` (the `custom_domain = true` approach handles this automatically via Cloudflare). The zone ID `9b1b321a3921da4741063f25d6935a74` is referenced in the Task 2 prompt for context only. It does not appear in any checked-in file. No action needed.

**No secrets on the static page**: The page has no API keys, no auth tokens, no server-side logic, no environment variables, no inline scripts. The JSON-LD blocks are inert structured data. This is the correct design.

**Tight CSP is correct**: `script-src 'none'` on a page with zero JavaScript is exactly right. The docs site's looser `script-src 'self'` is appropriate there but would be a regression here. The plan correctly keeps them independent.

**Action SHA pinning**: All three action SHAs (`checkout`, `setup-node`, `wrangler-action`) are pinned to the same commit SHAs already present in `deploy-docs.yml`. This is correct supply chain hygiene. No drift introduced.

**HSTS without `preload`**: The proposed HSTS header is `max-age=31536000; includeSubDomains` without `preload`. This is consistent with the docs site and is a safe choice — adding `preload` is a one-way door that requires submission to the HSTS preload list. Not a finding; noting it for awareness.

**No analytics or third-party resources**: The explicit prohibition against analytics/tracking scripts eliminates the most common source of CSP violations and privacy exposure on landing pages. Correct call.

---

### Recommendations (priority order)

1. Add `object-src 'none'` and `base-uri 'self'` to the CSP in `landing/_headers`. One-line change, no risk.
2. Create a resource-scoped `CLOUDFLARE_API_TOKEN_LANDING` secret for the landing deploy workflow before the first CI run. Do not reuse the docs token.
3. When billing ships and pricing becomes real: add `offers` back to JSON-LD and ensure the structured data matches the visible pricing exactly. The current decision to omit it is correct.
