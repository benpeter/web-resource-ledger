## Security Review: CORS, HSTS preload, X-RateLimit-Limit (Phase 3.5)

**Verdict: APPROVE**

The plan is well-specified from a security standpoint. Key risks are identified and mitigated correctly. No blocking issues found.

---

### What the plan gets right

**CORS origin validation** is exact-match against a parsed array (`allowed.includes(origin)` after `.split(',')`) -- not a substring check on the raw string, not a regex, no wildcards. This is the correct approach and directly prevents the most common CORS bypass: the substring confusion where `allowed-origin.com` would naively match `evil-allowed-origin.com.attacker.com`.

**Fail-closed default**: empty or absent `CORS_ORIGINS` disables CORS entirely. The POST endpoint requires Authorization, so there is no scenario where a wildcard fallback would be "safe." The plan explicitly forbids the `*` fallback on this endpoint.

**Vary: Origin** is mandatory and explicitly tested. Without it, CDN cache poisoning (serving one origin's CORS response to a different origin) is a real risk on this architecture given Cloudflare's edge caching. The plan calls it out as HIGH risk and enforces it in both implementation and test.

**CORS on error responses**: applying CORS headers in the global response pipeline rather than inside individual handlers ensures 401/400/429 responses also carry the correct headers. Without this, browsers suppress the real error and show a confusing CORS failure -- the plan correctly identifies this as a usability and debuggability concern, not just a security one.

**HSTS preload**: `max-age=63072000; includeSubDomains; preload` meets hstspreload.org requirements. The plan acknowledges irreversibility and defers submission to post-merge verification -- correct operational caution. The `includeSubDomains` requirement means all subdomains of the registered domain must serve HTTPS; verify no HTTP-only subdomains exist before submitting.

**Rate limit information disclosure**: excluding `X-RateLimit-Remaining` and `X-RateLimit-Reset` is the right call. These headers would let an attacker precisely time requests to stay under the limit. Hiding global capacity from the `503` path is also correct -- exposing it would tell an attacker exactly how many parallel IPs saturate the service. The plan explicitly documents both as intentional omissions.

**OPTIONS preflight bypass of rate limiting and auth**: correct. OPTIONS must not be rate-limited or auth-checked or it breaks legitimate browser preflight flows entirely.

---

### One advisory note (non-blocking)

The `getCorsHeaders` function name is slightly misleading -- it returns the allowed origin string (or `null`), not headers. This is a minor readability issue that could cause a future maintainer to misread the control flow. Consider renaming to `getAllowedOrigin` or similar. Not a security issue, just naming hygiene.

---

### Risks already in the plan

All four risks in the plan's risk table are correctly categorized and mitigated. No additional risks identified within this scope.

**APPROVE** -- proceed to execution.
