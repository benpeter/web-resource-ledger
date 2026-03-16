## Domain Plan Contribution: devx-minion

### Recommendations

#### 1. Code Sharing Strategy: Copy, Don't Share

**Recommendation: vendor the four verification modules into the CLI package.**

The modules needed for verification are small, self-contained, and stable:

| Module | Lines | External deps | Notes |
|--------|-------|---------------|-------|
| `verify.js` | 241 | `fflate`, `sha256`, `canonicalize`, `verifySignature`, `verifyTimestamp` | Orchestrator |
| `canonical-json.js` | 7 | None | Pure function |
| `rfc3161.js` | ~548 | None (DER primitives only) | Only `verifyTimestamp` needed (not `requestTimestamp`) |
| `signing.js` | 133 | `node:crypto` (only `getSigningKeys`), `crypto.subtle` | Only `verifySignature` needed |

A monorepo workspace (`packages/verify-core`) would be the "clean" architecture answer, but it adds real costs that violate the project's engineering philosophy:

- **Build complexity**: workspace tooling, shared `tsconfig`, publish coordination.
- **Coupling**: any Worker change to a shared module now requires CLI-side validation.
- **npx penalty**: workspace packages aren't independently publishable without a build step or workspace protocol resolution.
- **YAGNI**: these four modules have changed infrequently and only the verification-time paths are needed (not `getSigningKeys`, `signBytes`, `requestTimestamp`, `buildWarc`, etc.).

**Concrete approach**: create `packages/verify/lib/` with copied versions of the four modules, stripped to verification-only exports. The `sha256` function gets inlined (it's 3 lines). The copy is a one-time fork -- the Worker and CLI diverge intentionally because they serve different runtimes.

If the Worker verification logic changes in the future, the `outcome.md` for that phase should note that `packages/verify/lib/` needs a corresponding update. A comment at the top of each vendored file should reference its origin:

```js
// Vendored from src/verify.js -- verification-only subset
// Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/verify.js
```

#### 2. `crypto.subtle` vs `node:crypto` for SHA-256

**Recommendation: use `node:crypto.createHash` directly. No shim needed.**

The `sha256` function in `warc.js` uses `crypto.subtle.digest('SHA-256', data)` -- this is the Web Crypto API, designed for browser/Worker environments. It works in Node.js 20+ but is async and more verbose than necessary.

For the CLI, replace with the synchronous `node:crypto` equivalent:

```js
import { createHash } from 'node:crypto';

export function sha256(data) {
  const hex = createHash('sha256').update(data).digest('hex');
  return `sha256:${hex}`;
}
```

This is simpler, faster (no promise overhead), and idiomatic for Node.js. The `verifySignature` function already uses `crypto.subtle` for Ed25519 -- this works natively in Node 20+ and should be kept as-is. Ed25519 support via `crypto.subtle` was stabilized in Node 18.

**Do not** add a Web Crypto polyfill or shim layer. The CLI targets Node.js exclusively; use Node.js APIs directly.

#### 3. Ed25519 Verification: `crypto.subtle` Is Fine

The `verifySignature` function in `signing.js` uses:
- `crypto.subtle.importKey('raw', ..., 'Ed25519', ...)` for public key import
- `crypto.subtle.verify('Ed25519', ...)` for signature verification

Both work in Node.js 20+ (which is the project's engine requirement per `package.json`). No changes needed. The function already accepts raw public key bytes and a base64 signature -- perfect for CLI use.

#### 4. CLI Package Structure and `bin` Entry

**Recommended structure:**

```
packages/verify/
  package.json
  bin/
    wrl-verify.js          # entry point with shebang
  lib/
    verify.js              # vendored, trimmed
    canonical-json.js      # vendored verbatim
    rfc3161.js             # vendored, verify-only exports
    signing.js             # vendored, verifySignature only
    sha256.js              # Node.js native, 4 lines
    cli.js                 # argument parsing, output formatting, exit codes
    fetch-wacz.js          # remote URL fetching (HTTPS + WRL API)
    key-resolver.js        # fetches public key from /.well-known/signing-key
  test/
    cli.test.js
    verify.test.js         # adapted from existing test suite
  README.md
```

**`package.json` essentials:**

```json
{
  "name": "@wrl/verify",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "wrl-verify": "./bin/wrl-verify.js"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "files": ["bin/", "lib/"],
  "dependencies": {
    "fflate": "^0.8.2"
  }
}
```

**`bin/wrl-verify.js`:**

```js
#!/usr/bin/env node
import { run } from '../lib/cli.js';
run(process.argv.slice(2));
```

Key decisions:

- **ESM throughout** (`"type": "module"`). The shebang `#!/usr/bin/env node` works with ESM in Node 20+.
- **`fflate` is the only runtime dependency.** This is critical for npx zero-install speed. One dependency means fast install.
- **No argument parsing library.** The CLI has a narrow surface (1-2 positional args, a handful of flags). `process.argv` parsing in ~40 lines is simpler and eliminates a dependency. Libraries like `commander` or `yargs` add 200KB+ to the install.
- **`@wrl/verify` scope** implies an npm org. Verify the `wrl` org exists on npm or use `wrl-verify` as an unscoped package for simpler npx usage (`npx wrl-verify` vs `npx @wrl/verify`).

#### 5. CLI Interface Design

Following the Heroku CLI pattern and clig.dev conventions:

```
USAGE
  $ npx @wrl/verify <file-or-url> [--key <base64>] [--key-url <url>]
                                   [--json] [--verbose] [--help]

ARGUMENTS
  <file-or-url>    Path to a .wacz file, or a WRL capture URL
                   (e.g., https://wrl.benpeter.workers.dev/v1/captures/cap_xxx)

FLAGS
  --key <base64>     Ed25519 public key (base64). Required for local files
                     unless --key-url is also provided.
  --key-url <url>    URL to fetch the public key from. Defaults to the WRL
                     server's /.well-known/signing-key endpoint when verifying
                     a remote capture URL.
  --json             Output machine-readable JSON to stdout
  -v, --verbose      Show detailed check information
  -h, --help         Show this help message
  --version          Show version number

EXIT CODES
  0    All checks passed (verified)
  1    One or more checks failed (not verified)
  2    Usage error (bad arguments, missing file, network error)

EXAMPLES
  # Verify a local WACZ file with an explicit key
  $ npx @wrl/verify capture.wacz --key "base64pubkey..."

  # Verify a remote capture (key fetched automatically)
  $ npx @wrl/verify https://wrl.benpeter.workers.dev/v1/captures/cap_abc123

  # Pipe JSON output to jq
  $ npx @wrl/verify capture.wacz --key "..." --json | jq '.checks'
```

**Design rationale:**

- **Single positional argument** -- the most common use case (verify a file or URL) is the simplest invocation. No subcommands needed for a single-purpose tool.
- **Automatic key resolution for remote URLs** -- when given a WRL capture URL, the CLI can derive the server origin and fetch `/.well-known/signing-key` automatically. This is the "zero-config for 80%" principle. The user only needs `--key` when verifying a local file without a known server.
- **Exit code 1 for verification failure** -- this makes the CLI composable in shell scripts: `npx @wrl/verify file.wacz --key "..." && echo "OK"`. Exit code 2 distinguishes "the tool couldn't run" from "the tool ran and found tampering."
- **`--json` to stdout** -- human-readable output goes to stdout by default; `--json` switches to machine-parseable output. Warnings and progress go to stderr in both modes.
- **No `--no-color` flag needed initially** -- use `process.stdout.isTTY` to auto-detect. Respect `NO_COLOR` env var per https://no-color.org/.

#### 6. Human-Readable Output Design

**Verified output:**

```
Verified

  File integrity         pass
  Bundle integrity       pass
  Digital signature      pass
  Timestamp (RFC 3161)   pass    2026-03-16T12:00:00.000Z

  Signed at: 2026-03-16T11:59:58.000Z
  Bundle hash: sha256:a1b2c3d4...
```

**Failed output:**

```
Verification Failed

  File integrity         FAIL    One or more artifact hashes do not match
  Bundle integrity       pass
  Digital signature      pass
  Timestamp (RFC 3161)   skip    No independent timestamp was obtained

  Signed at: 2026-03-16T11:59:58.000Z
  Bundle hash: sha256:a1b2c3d4...
```

Design notes:
- Use ANSI color for pass/FAIL when connected to a TTY (green/red).
- FAIL is uppercase to draw attention; pass is lowercase (quiet success pattern).
- `skip` is styled as neutral (dim/gray on TTY).
- Crypto details shown by default in non-JSON mode (users running the CLI want to see them).
- No table borders (noisy, breaks grep).

#### 7. Remote URL Support

When the user provides a URL, the CLI must:

1. **Detect URL type**: is it a WRL capture URL (`/v1/captures/cap_xxx`) or a direct `.wacz` file URL?
2. **For WRL capture URLs**: fetch the WACZ artifact via `GET /v1/captures/{id}/artifacts/wacz` and auto-resolve the public key via `GET /.well-known/signing-key` from the same origin.
3. **For direct `.wacz` URLs**: download the file, require `--key` or `--key-url`.
4. **Size guard**: refuse downloads >100MB (matching the Worker's `MAX_WACZ_BYTES`).
5. **Timeout**: 30s for WACZ download, 5s for key fetch.
6. **Use native `fetch`**: Node 20+ has global fetch. No dependency needed.

URL detection heuristic:

```js
function isWrlCaptureUrl(input) {
  try {
    const url = new URL(input);
    return /\/v1\/captures\/cap_[a-f0-9]{32}$/.test(url.pathname);
  } catch {
    return false;
  }
}
```

#### 8. Dependency Analysis for npx Zero-Install

**Target: 1 runtime dependency (`fflate`).**

| Concern | Solution | Dependency? |
|---------|----------|-------------|
| ZIP extraction | `fflate` | Yes (already used by Worker) |
| SHA-256 | `node:crypto.createHash` | No |
| Ed25519 verify | `crypto.subtle` (Node 20+) | No |
| DER/ASN.1 parsing | Vendored `rfc3161.js` | No |
| Argument parsing | Manual (~40 lines) | No |
| HTTP fetch | Global `fetch` (Node 20+) | No |
| Terminal colors | ANSI escape codes (~20 lines) | No |
| CMS/X.509 chain validation | Deferred (see Risks) | N/A |

**Install time estimate**: `fflate` is 44KB packed, zero transitive dependencies. `npm install` should complete in <2 seconds. npx will cache after first run.

**Why not add a CMS/X.509 library?** The Worker's `rfc3161.js` already notes that "full CMS certificate chain validation is deferred (not feasible in Cloudflare Workers)." The CLI could theoretically do it using `@peculiar/asn1-cms` or `pkijs`, but these libraries are heavyweight (pkijs alone is 1MB+ with dependencies). The CLI should match the Worker's verification semantics exactly -- messageImprint match only, no chain validation. Document this limitation clearly. CMS validation can be added in a future version if needed.

#### 9. Package Naming and npx Ergonomics

Two options:

| Option | npx invocation | Pros | Cons |
|--------|---------------|------|------|
| `@wrl/verify` | `npx @wrl/verify file.wacz` | Namespaced, clear ownership | Requires npm org `wrl` |
| `wrl-verify` | `npx wrl-verify file.wacz` | Simpler npx, no org needed | Name squatting risk |

**Recommendation: `@wrl/verify`** if the npm org is available. The scoped name is cleaner and prevents name collision. The npx invocation is only slightly longer.

If the org is not available, `wrl-verify` is an acceptable fallback. Either way, the `bin` field key should be `wrl-verify` (the command name users type).

### Proposed Tasks

#### Task 1: Scaffold CLI Package

**What**: Create `packages/verify/` with `package.json`, `bin/wrl-verify.js`, and directory structure. Set up `"type": "module"`, `"engines"`, `"bin"`, and `"files"` fields. Add `fflate` as the sole runtime dependency.

**Deliverables**: Working `package.json`, shebang entry point, empty `lib/` and `test/` directories.

**Dependencies**: None. Can start immediately.

#### Task 2: Vendor Verification Modules

**What**: Copy `verify.js`, `canonical-json.js`, `rfc3161.js` (verification-only subset), and `verifySignature` from `signing.js` into `packages/verify/lib/`. Create `sha256.js` using `node:crypto.createHash`. Update import paths. Add origin comments.

**Deliverables**: Self-contained verification library under `lib/` that passes the existing `verify.test.js` suite (adapted for Node.js imports).

**Dependencies**: Task 1 (package scaffolding).

#### Task 3: Port and Adapt Test Suite

**What**: Adapt `test/verify.test.js` (including v0.2.0 timestamp tests) to run against the vendored modules. Use `vitest` or Node.js native test runner. Ensure all existing assertions pass with the Node.js crypto implementation.

**Deliverables**: Test suite covering all verification scenarios (happy path, tamper detection, error handling, security invariants, v0.2.0 timestamp).

**Dependencies**: Task 2 (vendored modules).

#### Task 4: Build CLI Argument Parser and Output Formatter

**What**: Implement `lib/cli.js` with:
- Argument parsing (positional file/URL, `--key`, `--key-url`, `--json`, `--verbose`, `--help`, `--version`)
- Human-readable output with ANSI color (TTY-aware)
- JSON output mode
- Exit codes (0/1/2)
- Error messages following the three-component pattern (what went wrong, how to fix, how to get help)

**Deliverables**: CLI that works with local `.wacz` files. `--help` output. Exit codes.

**Dependencies**: Task 2 (vendored modules).

#### Task 5: Implement Remote URL Support

**What**: Build `lib/fetch-wacz.js` and `lib/key-resolver.js`:
- WRL capture URL detection and WACZ download via artifacts API
- Public key auto-resolution from `/.well-known/signing-key`
- Size guard (100MB)
- Timeout handling (30s download, 5s key fetch)
- Clear error messages for network failures

**Deliverables**: Remote verification working end-to-end. Integration test against staging.

**Dependencies**: Task 4 (CLI framework).

#### Task 6: End-to-End Testing Against Real Captures

**What**: Test the CLI against actual WRL captures (staging or production):
- Download a real `.wacz` file, verify locally with `--key`
- Verify a remote capture URL (key auto-resolved)
- Verify tamper detection by modifying a downloaded `.wacz`
- Test error cases: wrong key, non-existent URL, corrupt file

**Deliverables**: Integration test script or documented manual test plan.

**Dependencies**: Task 5 (remote support).

#### Task 7: Write README and Help Text

**What**: Write a README that gets a user from zero to first verification in under 2 minutes. Include:
- One-liner npx invocation
- Three usage examples (local file, remote URL, JSON output)
- How to obtain the public key
- What each check means
- Exit codes
- Limitations (no CMS chain validation)

**Deliverables**: `packages/verify/README.md`, polished `--help` output.

**Dependencies**: Task 6 (verified working end-to-end).

### Risks and Concerns

#### Risk 1: npm Org Availability

The `@wrl` npm org may not exist or may be owned by someone else. **Mitigation**: check `npm org ls wrl` before committing to the scoped name. Fall back to `wrl-verify` if unavailable.

#### Risk 2: Ed25519 Support in Node.js 20

Ed25519 via `crypto.subtle` is available in Node.js 20+ but was experimental in earlier versions. The project already pins `"engines": { "node": ">=20.0.0" }` so this is acceptable. However, users running older Node.js will get cryptic errors from `crypto.subtle.importKey`. **Mitigation**: add a Node.js version check at CLI startup with a clear error message:

```
Error: @wrl/verify requires Node.js 20 or later.
You are running Node.js 18.19.0.

To upgrade: https://nodejs.org/
```

#### Risk 3: No CMS Certificate Chain Validation

The CLI verifies that the RFC 3161 timestamp's messageImprint matches the bundle hash, but does NOT verify the TSA's certificate chain. This matches the Worker's behavior but may confuse users who expect "full" timestamp verification. **Mitigation**: document this explicitly in `--help`, README, and in the JSON output (add a `note` field to the timestamp check when status is `pass`). Frame it as "timestamp hash verified; TSA certificate chain validation is not performed" rather than hiding the limitation.

#### Risk 4: Large WACZ Files and Memory

The CLI loads the entire WACZ into memory (same as the Worker). For files approaching 100MB, this could be slow or fail on memory-constrained machines. **Mitigation**: match the Worker's 100MB limit, show a progress indicator during file read, and document the limit.

#### Risk 5: Semantic Drift Between Worker and CLI Verification

Over time, the Worker's `verify.js` may gain new checks or change semantics. The vendored copy in the CLI won't automatically receive these changes. **Mitigation**: add a version comment in both files referencing the verification protocol version (currently v0.1.0 and v0.2.0). When the Worker adds a new check, the evolution log should flag the CLI for update. This is acceptable because verification semantics should change rarely and deliberately.

#### Risk 6: `atob`/`btoa` in Node.js

The vendored code uses `atob()` and `btoa()` for base64. These are available as globals in Node.js 16+ but produce deprecation warnings in some configurations. **Mitigation**: replace with `Buffer.from(str, 'base64')` and `Buffer.from(bytes).toString('base64')` in the vendored files. This is idiomatic Node.js and avoids any compatibility concerns.

### Additional Agents Needed

**None.** The current team (devx, security, api-design, test, ux-strategy, software-docs) covers all aspects:

- **security-minion**: public key trust model, key pinning strategy, what to verify and what to defer
- **test-minion**: test strategy for vendored modules and CLI integration tests
- **api-design-minion**: remote URL fetching, API interaction patterns
- **ux-strategy-minion**: output formatting, error message tone
- **software-docs-minion**: README and help text
