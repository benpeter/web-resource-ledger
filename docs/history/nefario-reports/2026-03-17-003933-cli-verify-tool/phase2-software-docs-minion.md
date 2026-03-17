# Domain Plan Contribution: software-docs-minion

## Recommendations

### 1. The CLI package needs its own README.md

The CLI is a separate npm package (`@wrl/verify`) with a distinct audience: people who have a `.wacz` file and want to verify it. They may never interact with the WRL API, never deploy a Worker, and never read the main repo README. The CLI README must be self-contained for that audience.

**What the CLI README should cover:**

- What it does (one sentence: verify WRL WACZ captures offline)
- Install (`npm install -g @wrl/verify` or `npx @wrl/verify`)
- Usage (2-3 examples covering the primary workflow: verify a local .wacz file, verify against a remote WRL instance, interpret output)
- Exit codes (critical for CI/pipeline integration -- exit 0 on verified, exit 1 on failure, exit 2 on usage error)
- How the verification works (brief: what the 4 checks are, what "skip" means for timestamps, that the public key comes from the server not the bundle)
- Link back to the main repo for: WRL project overview, API documentation, how captures are created, the signing architecture

**What it should NOT cover:**

- WRL deployment, setup, or configuration (link to main README)
- The capture API (link to main README or openapi.yaml)
- Internal architecture of the verification logic
- How to generate signing keys

### 2. `--help` should be the primary reference, README the orientation

The `--help` text is the first thing a developer reaches for. It should be comprehensive enough that a user never needs the README to run a basic verification. But it should be terse -- not a tutorial.

**Recommended `--help` structure:**

```
wrl-verify <file> [options]

Verify the cryptographic integrity of a WRL WACZ capture.

Arguments:
  file              Path to .wacz file (or - for stdin)

Options:
  --server <url>    WRL server URL for public key fetch
                    (default: reads from WACZ bundle metadata)
  --key <path>      Path to public key file (base64 or raw)
                    (alternative to --server)
  --json            Output results as JSON
  --quiet           Exit code only, no output
  --version         Show version
  --help            Show this help

Exit codes:
  0  All checks passed (verified)
  1  One or more checks failed (not verified)
  2  Usage error (missing file, bad options)

Examples:
  wrl-verify capture.wacz --server https://wrl.example.com
  wrl-verify capture.wacz --key public.key
  cat capture.wacz | wrl-verify - --server https://wrl.example.com
```

Keep it under 30 lines. No explanation of what SHA-256 is or how Ed25519 works -- that belongs in the README's "How verification works" section.

### 3. package.json metadata for npm publication

The following fields matter for npm discoverability and ecosystem integration:

```json
{
  "name": "@wrl/verify",
  "version": "0.1.0",
  "description": "Verify cryptographic integrity of WRL WACZ web capture bundles",
  "license": "Apache-2.0",
  "author": "Ben Peter <bp@ben-peter.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/benpeter/web-resource-ledger.git",
    "directory": "packages/verify"
  },
  "homepage": "https://github.com/benpeter/web-resource-ledger/tree/main/packages/verify#readme",
  "bugs": "https://github.com/benpeter/web-resource-ledger/issues",
  "keywords": [
    "wacz",
    "web-archive",
    "verification",
    "cryptographic",
    "ed25519",
    "wrl",
    "digital-evidence",
    "integrity"
  ],
  "bin": {
    "wrl-verify": "./bin/wrl-verify.js"
  },
  "type": "module",
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "bin/",
    "lib/",
    "README.md",
    "LICENSE"
  ]
}
```

Key decisions reflected above:

- **`repository.directory`**: Points npm users to the package within the monorepo. npm renders this as a link on the package page.
- **`homepage`**: Points to the CLI's own README, not the root. This is what npm shows as the primary link.
- **`bugs`**: Single issue tracker for the whole project. No need for separate issue tracking.
- **`keywords`**: Chosen for npm search discoverability. "wacz" and "web-archive" are the community terms. "ed25519" and "cryptographic" are what security-minded users search for.
- **`files`**: Whitelist approach. Only ship what's needed. No test fixtures, no src if compiled, no docs beyond README.
- **`bin`**: The CLI entry point. `wrl-verify` is the command name (not `wrl` which is too generic and would conflict if the project adds more CLI tools later).

### 4. Main repo README should add a brief CLI reference

Add a short section to the main README after the existing "Step 4: Verify the bundle" section. Place it there because that is exactly where a reader thinks "but what if I want to verify offline?"

**Suggested addition to main README (after the verify curl example):**

```markdown
#### Offline verification

For offline or automated verification, use the CLI tool:

```bash
npx @wrl/verify capture.wacz --server https://wrl.example.com
```

See [@wrl/verify](packages/verify/) for full documentation.
```

That is the entire addition. Three lines. Links to the CLI README for everything else. The main README's audience is WRL operators and API consumers; the CLI is a supporting tool, not the primary interface.

### 5. No man page

Man pages add maintenance burden with near-zero value for an npm CLI tool. The audience is JavaScript developers and CI pipelines. They use `--help`, not `man`. If demand emerges later, generate it from the `--help` text -- do not hand-write a man page.

### 6. JSON output is critical documentation surface

The `--json` flag output becomes a de facto API contract for CI integrations. Document the JSON schema explicitly in the README because it will be consumed programmatically. The structure should mirror the existing server verification response (`verified`, `checks` array, `capture` metadata) so users familiar with the API see the same shape.

## Proposed Tasks

### T-DOC-1: Write CLI package README.md
**Effort:** S (small)
**Dependencies:** CLI implementation must be far enough along to know the final flag set and output format.
**Deliverable:** `packages/verify/README.md` with: one-line description, install, usage examples, exit codes, JSON output schema, "how verification works" section, links to main repo.

### T-DOC-2: Implement `--help` text
**Effort:** XS
**Dependencies:** Final CLI argument parsing implementation.
**Deliverable:** Help text following the structure recommended above, embedded in the CLI source (not a separate file).

### T-DOC-3: Add package.json metadata for npm publication
**Effort:** XS
**Dependencies:** Package directory structure must be decided (assumed `packages/verify/`).
**Deliverable:** Complete package.json with all npm-relevant fields.

### T-DOC-4: Add CLI reference to main repo README
**Effort:** XS
**Dependencies:** Package name must be finalized.
**Deliverable:** 3-5 line addition to main README in the verification section.

### T-DOC-5: Document JSON output schema
**Effort:** XS
**Dependencies:** T-DOC-1 (included in README), and CLI implementation must define the output shape.
**Deliverable:** JSON output example and field descriptions in the CLI README.

## Risks and Concerns

### Risk 1: Output format becomes a contract before it is intentional

Once the CLI is published, the JSON output shape (`--json`) becomes a public API. CI pipelines will parse it. Changing the shape after 1.0 is a breaking change. The output format must be designed deliberately before publication, not inherited as an accident of whatever the implementation produces. **Mitigation:** Document the JSON output schema in the README and treat it as a contract from v0.1.0. Use the same structure as the server's `/v1/verify/` response so there is one shape to maintain.

### Risk 2: README drift between CLI and main repo

Two READMEs describing verification (main repo and CLI package) will drift apart. The CLI README should describe how to use the tool; the main README should describe what verification checks exist. If both describe the checks, they will eventually contradict. **Mitigation:** The CLI README should link to the main README for the verification model. It should describe the tool's interface (flags, exit codes, output), not the cryptographic theory. One source of truth for each concern.

### Risk 3: Monorepo package path affects npm display

If the package lives at `packages/verify/`, the `repository.directory` field in package.json must match exactly. npm uses this to construct the "browse source" link. A mismatch means npm links to a 404. **Mitigation:** Verify the npm package page renders correctly after first publish. Add a check to CI that validates package.json `repository.directory` against the actual file path.

### Risk 4: Missing LICENSE in published package

npm packages need a LICENSE file in the package directory (not just at the repo root) for the npm package page to display license information correctly. The `files` whitelist in package.json must include it. **Mitigation:** Either symlink or copy the root LICENSE into `packages/verify/` and include it in the `files` array.

## Additional Agents Needed

None specifically for the documentation tasks. However:

- **The CLI implementation agent** should coordinate with these documentation tasks on: final flag names, exit code semantics, JSON output schema, and the package directory path. Documentation should not be written speculatively -- it should reflect the implemented behavior.
- If the project decides to publish an npm organization scope (`@wrl`), that requires npm organization setup which is outside documentation scope.
