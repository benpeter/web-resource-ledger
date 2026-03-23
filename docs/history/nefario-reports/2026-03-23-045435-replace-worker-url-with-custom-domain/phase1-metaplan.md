# Meta-Plan: Replace Worker URL with Custom Domain

## Task Summary

Replace all functional references to `wrl.benpeter.workers.dev` with
`api.webresourceledger.com` across code, config, and user-facing docs. The
custom domain is already configured and live. Staging references are excluded.
Historical records (`docs/history/`, `docs/evolution/`, `.claude/worktrees/`)
are excluded.

## Analysis

After reading all referenced files, this is a well-scoped mechanical
replacement across 12 files in three categories:

1. **Code/config** (7 files): `openapi.yaml`, `src/mcp.js` (JSDoc comment),
   `src/webhook-dispatch.js` (fallback URL), `server.json` (MCP remote URL),
   `packages/verify/lib/key-resolver.js` (help text), `scripts/autonomous/lib/verify-phase.sh`
   (smoke test URL), `scripts/autonomous/setup-credentials.sh` (health check URL)
2. **Tests** (3 files): `packages/verify/test/key-resolver.test.js`,
   `packages/verify/test/cli-args.test.js`, `packages/verify/test/cms-chain.test.js`
3. **User-facing docs** (1 file): `docs/mcp.md`
4. **Landing page** (1 file): `landing/public/index.html` (3 links to auth/UI)

The `openapi.yaml` already has `api.webresourceledger.com` as the primary
server -- the legacy entry at line 16-17 should be kept as a third entry
(or removed, depending on whether we want backward-compat documentation).

The `landing/public/index.html` links point to `/auth/login` and `/ui` --
these are auth/UI flows served by the worker, and `api.webresourceledger.com`
routes to the same worker, so the replacement is valid.

This task does NOT require specialist planning input. The files are
enumerated, the replacement is mechanical, the domain is already live, and
there are no architectural decisions. The only judgment call is whether to
keep the legacy URL as a documented alias in `openapi.yaml` (the task says
"replace all functional references", suggesting removal or demotion).

## Planning Consultations

None recommended. This task is fully specified by the user with an explicit
file list and success criteria. Consulting specialists would add latency
without adding insight.

**Rationale for skipping specialist planning**: The task is a find-and-replace
with known inputs and outputs. No API design decisions (the URL is already
chosen). No infrastructure changes (DNS is already live). No security
implications (same origin, same TLS). No UX strategy questions (the domain
name is decided). No documentation architecture changes (same content,
different URL string).

### Cross-Cutting Checklist

- **Testing**: NOT needed for planning. The task includes test file updates.
  Phase 6 (post-execution test run) will validate all tests pass. No new
  test strategy decisions required.
- **Security**: NOT needed. Same Cloudflare Worker, same TLS termination,
  same origin policies. The domain change is DNS-level and already
  configured. No new attack surface.
- **Usability -- Strategy**: NOT needed for planning. This is a URL string
  replacement with no user journey changes. The custom domain is strictly
  more professional/memorable than a workers.dev subdomain.
- **Usability -- Design**: NOT needed. No UI component changes beyond a URL
  string in an href attribute.
- **Documentation**: NOT needed for planning. The docs changes are mechanical
  URL replacements in `docs/mcp.md`. Post-execution Phase 8 will verify
  documentation coverage.
- **Observability**: NOT needed. No runtime component changes.

### Notable Exclusions

- **api-design-minion**: The API surface is unchanged -- only the base URL
  hostname changes. No versioning, endpoint, or contract decisions.
- **ux-strategy-minion**: No user journey changes. The custom domain is a
  branding improvement that requires no journey analysis.
- **security-minion**: Same worker, same TLS, same auth. DNS is already live
  and verified.

### Anticipated Approval Gates

**None.** All tasks are easy to reverse (text replacement in tracked files)
with zero architectural decisions. The user provided explicit file lists and
success criteria. A single execution task with no gates is appropriate.

### Rationale

This is a mechanical replacement task with:
- Explicit file list provided by the user
- Clear success criteria (grep returns 0 matches + tests pass)
- No architectural decisions (domain already chosen and configured)
- No dependency ordering (all replacements are independent)
- Easy reversibility (git revert)

The most efficient plan is a single execution task assigned to one agent who
performs all replacements, verifies with the grep command, and runs the test
suite. No planning phase adds value here.

### Scope

**In scope**: Replace `wrl.benpeter.workers.dev` with
`api.webresourceledger.com` in the 12 files listed above. Verify with grep
and test suite.

**Out of scope**: Staging URL changes, historical docs, worktree copies,
DNS/infrastructure changes, openapi.yaml structural changes beyond the URL.

### External Skill Integration

No external skills detected in project.
