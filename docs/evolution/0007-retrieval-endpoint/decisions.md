# Decisions: Retrieval Endpoint

## 1. Worker-proxied URLs vs direct R2

**Decision**: Worker-proxied (`/v1/captures/{id}/artifacts/{name}`).

**Arguments for direct R2**: ux-strategy-minion argued for simplicity -- one
fewer hop, no Worker CPU on downloads, simpler implementation.

**Arguments for worker-proxied**: Three specialists converged independently:
- api-design-minion: Content-Type and Content-Length control requires Worker
  in the serving path, which the issue implicitly requires
- security-minion: HTML stored-XSS prevention requires Content-Type override
  to `text/plain` at serve time, only possible through Worker interception
- api-spec-minion: The capture-ID-as-access-secret model breaks if R2 keys
  become the access mechanism (R2 keys are guessable given the capture ID)

**Rejected alternative**: Pre-signed R2 URLs -- unnecessary complexity when
the Worker can serve directly, and pre-signed URLs leak the R2 key structure.

## 2. Complete-only 200 vs all lifecycle states

**Decision**: Return 200 only for `status === 'complete'`. Everything else
returns 404.

**Arguments for all states**: api-spec-minion proposed returning pending/failed
captures with appropriate status fields, reducing round-trips (caller doesn't
need to hit the status endpoint first).

**Arguments for complete-only**: ux-strategy-minion argued for clean mental
model separation -- status endpoint owns lifecycle, retrieval endpoint owns
completed captures. security-minion argued that differentiating "unknown" from
"not yet complete" enables capture ID enumeration.

**Resolution**: Single static 404 message for all non-200 cases. The security
risk of response differentiation outweighs the UX improvement of lifecycle
states on the retrieval endpoint.

## 3. Schema shape: flat vs nested

**Decision**: Flat URL strings for simple artifacts, nested object for WACZ.

```json
{
  "artifacts": {
    "screenshot": "https://...",
    "html": "https://...",
    "headers": "https://..."
  },
  "wacz": {
    "url": "https://...",
    "size": 42000,
    "bundleHash": "sha256:..."
  }
}
```

**Arguments for fully nested**: api-design-minion proposed `{ url, contentType,
size }` per artifact for extensibility.

**Arguments for flat**: ux-strategy-minion and api-spec-minion both argued for
simplicity -- callers just need URLs. WACZ is special because `bundleHash` and
`size` are verification-relevant metadata that belongs together.

**Rejected alternative**: `capturedUrl` field name (api-spec-minion) in favor
of `url` for consistency with existing status endpoint response shape.

## 4. arrayBuffer() vs ReadableStream for artifact serving

**Decision**: Use `await obj.arrayBuffer()` instead of `obj.body` streaming.

**Discovery during execution**: The `@cloudflare/vitest-pool-workers` test
runner does not properly support ReadableStream from R2 `get()`. The test
agent discovered this and switched to buffering the full artifact.

**Trade-off**: Buffers entire artifact into Worker memory. Acceptable for
MVP artifact sizes (screenshots ~200KB, WACZ bundles ~200KB, max page size
50MB). Flagged as backlog item for streaming when WACZ bundles grow.

## 5. Cache-Control strategy

**Decision**: Three tiers of caching.

| Response | Cache-Control | Rationale |
|----------|--------------|-----------|
| Metadata 200 | `private, no-store` | Capture state could change |
| Artifact 200 | `public, max-age=31536000, immutable` | Content-addressed, never changes |
| All 404s | `no-store` | Prevent stale 404 caching at CDN/proxy |

security-minion's advisory ensured `no-store` on all error paths, not just
the metadata handler.

## 6. CORS: * on both retrieval endpoints

**Decision**: `Access-Control-Allow-Origin: *` on both GET endpoints.

The capture ID is the sole access credential (122-bit CSPRNG entropy). No
session cookies or bearer tokens are involved. CORS restrictions would
prevent legitimate browser-based verification tools without providing security
benefit.

The backlog notes that the capture (POST) endpoint should restrict origins
separately. This is a different trust model -- creating captures vs reading
them.
