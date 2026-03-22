# Domain Plan Contribution: iac-minion

## Summary

The MCP SDK + zod dependency adds ~130KB gzipped to the Worker bundle. This is
well within the 10MB compressed limit but represents a meaningful increase
(+18%) on top of the current 712KB gzipped bundle. The recommended approach is
a **separate Worker** for the MCP server, using Cloudflare's `agents` package
with `createMcpHandler`, connected to the main WRL Worker via service bindings.

---

## Recommendations

### 1. Bundle Size Impact (Measured)

| Component | Raw (minified) | Gzipped |
|-----------|---------------|---------|
| Current WRL Worker | 3,541 KB | 712 KB |
| MCP SDK (`@modelcontextprotocol/sdk` server imports + zod) | 561 KB | 130 KB |
| `agents` package (`createMcpHandler` + MCP SDK + zod) | 1,255 KB | 293 KB |
| Cloudflare Workers paid limit | -- | 10,240 KB |

**Key findings from bundle analysis:**

- **Zod v4** alone adds ~305 KB raw / 63 KB gzipped. The MCP SDK has zod as
  both a runtime dep and peer dep. The SDK internally imports `zod/v4` and
  `zod/v3` compatibility layer, which means both get bundled (131KB for v3
  types + 77KB for v4 core schemas).
- **MCP SDK** (`@modelcontextprotocol/sdk` v1.27.1) carries heavy Node.js-only
  runtime deps: `express`, `@hono/node-server`, `cors`, `raw-body`,
  `content-type`, `eventsource`, `jose`, `pkce-challenge`. These are needed
  for the SDK's built-in HTTP and auth transports but are **not usable on
  Workers** without the `agents` package providing a Workers-compatible
  transport (`WorkerTransport`).
- **`agents` package** (v0.7.9) pulls in `ai` SDK (440KB!), `mimetext` +
  `mime-db` (186KB), `partyserver`, `yargs`, and other deps that are not
  needed for a stateless MCP handler. The `agents` package also pins MCP SDK
  v1.26.0 (not v1.27.1), causing duplicate copies of the SDK in the bundle.
  Despite tree-shaking, esbuild cannot eliminate these because of side-effect
  imports in `agents/dist/index.js`.

**Bundle size with combined Worker (both approaches):**

| Approach | Estimated gzipped total |
|----------|------------------------|
| Same Worker + `agents` package | ~1,005 KB (712 + 293) |
| Same Worker + MCP SDK direct (if transport is hand-rolled) | ~842 KB (712 + 130) |
| Separate Worker (MCP only, with `agents`) | 712 KB + ~293 KB (two separate Workers) |

All approaches stay well under the 10MB compressed limit. The browser binding
(`@cloudflare/playwright`) is not bundled into the Worker -- it's loaded at
runtime by the Chromium service binding -- so it does not compete for the 10MB
budget.

### 2. Cold-Start Latency Impact

- **V8 isolate cold start** scales with script size. Empirical data from
  Cloudflare suggests ~1ms per 100KB of compressed script for parsing +
  compilation. Adding 130-293KB gzipped adds roughly **1-3ms** to cold start.
- **Module initialization**: The MCP SDK and zod perform schema registration at
  import time. This adds a small but measurable init cost. Creating `McpServer`
  per request (required by MCP SDK v1.26.0+ for security) means tool
  registration runs on every MCP request, not just cold starts.
- **Net impact**: Negligible. WRL's capture endpoint already takes 10-30s
  (browser rendering). MCP tool calls that proxy to the REST API will add
  <5ms overhead from MCP framing. Even a cold start penalty of 3ms is
  invisible.

### 3. CI Build Time Impact

- Current `npm install` is fast (3 runtime deps). Adding `agents` brings in
  ~258 transitive packages (measured). This will increase `npm install` time by
  5-15s depending on CI cache state.
- esbuild bundling time is not a concern -- even the agents bundle compiles in
  66ms.
- **Test overhead**: The MCP tools are thin proxies to existing REST handlers.
  Tests can use the MCP SDK's `Client` to exercise the tools against the
  existing test infrastructure. No new test infrastructure needed.

### 4. Same Worker vs. Separate Worker: SEPARATE WORKER (recommended)

**Strong recommendation: deploy the MCP server as a separate Worker.**

Rationale:

| Criterion | Same Worker | Separate Worker |
|-----------|------------|-----------------|
| Bundle size isolation | MCP deps inflate the main Worker even for non-MCP requests | Each Worker carries only its own deps |
| Deployment blast radius | MCP SDK update could break capture pipeline | Independent deployment, independent failures |
| Rate limiting | Must share or coordinate rate limit bindings | Gets its own rate limit namespace |
| Cold starts | Larger bundle = slightly slower cold start for ALL requests | MCP cold starts don't affect capture/verify latency |
| Auth model | MCP auth (OAuth 2.1 / API key) vs WRL API key auth -- mixing is messy | Clean separation: MCP Worker validates MCP sessions, calls WRL Worker with service binding |
| Routing | Need to mux `/mcp` alongside `/v1/captures` in the same router | `/mcp` is the only route; clean single-purpose Worker |
| Cost | One Worker | Two Workers, but no cost increase (Workers pricing is per-request, not per-Worker) |
| Local dev | One `wrangler dev` process | `wrangler dev -c wrangler.toml -c ../wrl-mcp/wrangler.toml` |
| Future evolution | Tightly coupled -- MCP changes require full regression | MCP server can evolve independently (add tools, change auth) |

**Implementation pattern:**

```
wrl/                          # existing Worker (unchanged)
  wrangler.toml
  src/index.js

wrl-mcp/                      # new Worker
  wrangler.toml               # service binding to wrl Worker
  src/index.js                # createMcpHandler + 3 tools
  package.json                # agents, @modelcontextprotocol/sdk, zod
```

The MCP Worker uses a **service binding** to call the main WRL Worker's REST
API internally. Service bindings are zero-latency (no network hop -- same
Cloudflare edge), zero-cost (no egress), and use the standard `fetch()` API.

```toml
# wrl-mcp/wrangler.toml
name = "wrl-mcp"
main = "src/index.js"
compatibility_date = "2026-03-13"
compatibility_flags = ["nodejs_compat"]

[[services]]
binding = "WRL"
service = "wrl"
```

```javascript
// wrl-mcp/src/index.js
import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function createServer(env) {
  const server = new McpServer({
    name: "Web Resource Ledger",
    version: "1.0.0",
  });

  server.tool("capture_url", "...", { url: z.string().url() }, async ({ url }) => {
    // Service binding call -- zero-latency internal fetch
    const res = await env.WRL.fetch("https://wrl/v1/captures", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.WRL_API_KEY}`,
      },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  });

  return server;
}

export default {
  fetch: (request, env, ctx) => {
    const server = createServer(env);
    return createMcpHandler(server)(request, env, ctx);
  },
};
```

### 5. Wrangler Bundling Compatibility

- The project uses `wrangler` with **no custom bundler config** (`main = "src/index.js"`,
  no `[build]` section in wrangler.toml). Wrangler uses esbuild internally.
- The `agents` package's ESM exports work with wrangler's esbuild. The
  `nodejs_compat` compatibility flag (already set) is required because the
  `agents` package imports `node:async_hooks` for `AsyncLocalStorage`.
- **No bundler config changes needed** for the MCP Worker. Standard wrangler
  behavior handles the `agents` + MCP SDK imports.
- The MCP SDK's Node.js-specific deps (`express`, `@hono/node-server`, etc.)
  will be tree-shaken by esbuild because the `agents/mcp` entrypoint only
  imports the SDK's server protocol and type modules, not the Node.js transport
  modules. The `agents` package's `WorkerTransport` replaces those.

---

## Proposed Tasks

### T1: Scaffold the MCP Worker project (separate directory)
- Create `wrl-mcp/` directory at repo root (sibling to main WRL source)
- `package.json` with deps: `agents`, `@modelcontextprotocol/sdk`, `zod`
- `wrangler.toml` with service binding to `wrl` Worker, staging env mirroring main
- Minimal `src/index.js` with health check tool only

### T2: Wire service binding from MCP Worker to WRL Worker
- Add `[[services]]` binding in `wrl-mcp/wrangler.toml` pointing to `wrl`
- Create a dedicated MCP tenant API key in WRL (the MCP Worker authenticates
  to WRL using a standard API key stored as a Worker secret)
- Test service binding works in local dev with multi-worker wrangler

### T3: Implement the three MCP tools
- `capture_url`: POST to `/v1/captures` via service binding, poll status, return result
- `get_capture`: GET `/v1/captures/{id}` via service binding
- `verify_capture`: GET `/v1/verify/{id}` via service binding
- Each tool maps 1:1 to the REST API. No business logic in the MCP layer.

### T4: Deploy pipeline
- Add `wrl-mcp/` to CI workflow (build, test, deploy)
- Staging environment: `wrl-mcp-staging` with service binding to `wrl-staging`
- Production: `wrl-mcp` with service binding to `wrl`
- Secrets: `WRL_API_KEY` (the MCP Worker's credential for calling WRL)

### T5: Verify bundle sizes post-integration
- Run `wrangler deploy --dry-run --outdir dist` for both Workers
- Document final compressed sizes in the evolution log
- Set up a CI check that fails if either Worker exceeds a size threshold
  (e.g., 2MB gzipped for WRL, 1MB gzipped for MCP)

---

## Risks and Concerns

### R1: `agents` package bloat (MEDIUM)
The `agents` package (v0.7.9) is a kitchen-sink SDK that includes AI SDK
integration, email handling, workflows, Durable Objects, and more. For our use
case, we only need `createMcpHandler` + `WorkerTransport`. The package adds
293KB gzipped despite only ~50KB of that being MCP-relevant code. esbuild
cannot tree-shake effectively because `agents/mcp/index.js` imports from
`agents/index.js` which has side effects.

**Mitigation options (in priority order):**
1. Accept the 293KB cost -- it's well within limits and the `agents` package is
   the officially supported path for MCP on Workers.
2. Monitor for improvement -- Cloudflare is actively developing the agents SDK;
   future versions may offer better tree-shaking or a standalone MCP transport
   export.
3. If size becomes a problem: extract `WorkerTransport` (~600 lines) into a
   local module and use `@modelcontextprotocol/sdk` directly. This is viable
   but creates a maintenance burden (tracking SDK transport protocol changes).

**Recommendation: Accept the cost (option 1).** 293KB gzipped is 2.9% of the
10MB limit. Premature optimization here violates YAGNI.

### R2: MCP SDK version churn (MEDIUM)
The MCP SDK is at v1.27.1 with a v2 anticipated in Q1 2026. The `agents`
package pins v1.26.0. Version skew between MCP SDK and agents SDK could cause
issues. The v1.26.0 pinning also caused duplicate SDK copies in the bundle
(~140KB wasted).

**Mitigation:** Pin both `agents` and `@modelcontextprotocol/sdk` explicitly in
the MCP Worker's package.json. Use `npm overrides` if needed to force a single
SDK version. Monitor for `agents` releases that bump the MCP SDK dep.

### R3: Service binding adds a deployment dependency (LOW)
The MCP Worker depends on the WRL Worker being deployed. If WRL is down or
being deployed, MCP tool calls will fail. This is acceptable because:
- Service bindings route to the live Worker version (not a specific deployment)
- WRL is already a production service with uptime expectations
- MCP tool failures are gracefully handled by AI agents (they retry or report)

### R4: `nodejs_compat` flag required (LOW)
The `agents` package uses `AsyncLocalStorage` from `node:async_hooks`. The main
WRL Worker already has `nodejs_compat` enabled, but this is worth noting for
the MCP Worker's wrangler.toml.

### R5: Auth model complexity (MEDIUM)
The MCP Worker needs to authenticate callers (AI agents) AND authenticate
itself to the WRL Worker. This creates a two-layer auth model:
- **External**: MCP clients authenticate to the MCP Worker (API key or OAuth)
- **Internal**: MCP Worker authenticates to WRL Worker via service binding with
  a dedicated API key

This is standard microservice auth but adds operational complexity (two sets
of keys to manage, rotate, and monitor).

---

## Additional Agents Needed

- **mcp-minion**: To validate the MCP tool schemas, transport configuration,
  and client compatibility testing approach. The mcp-minion should review the
  tool definitions and ensure they follow MCP best practices for tool
  descriptions, error handling, and content type usage.
