# Code Conventions

This document captures the conventions in use across the `web-resource-ledger`
codebase. Conventions here are derived from `CLAUDE.md` (the authoritative
engineering doc), `package.json`, and the actual code in `src/` and `test/`.

The project follows the [Helix Manifesto](https://github.com/adobe/helix-home/blob/main/manifesto.md):
**YAGNI, KISS, lean & mean, ops reliability wins, vanilla over framework,
latency <300ms.**

---

## 1. Module style — ESM, native imports

`package.json` declares `"type": "module"`, and the engine is Node ≥ 20.
All source files use ESM (`import` / `export`), with `.js` extensions on
relative specifiers. There is no bundler step for the Worker — `wrangler`
consumes `src/index.js` directly.

```js
// src/index.js
import { problemResponse, jsonResponse, batchItemSuccess, batchItemError } from './responses.js';
import { verifyApiKey, verifyAdminKey } from './auth.js';
import { performCapture } from './capture.js';
import { log } from './log.js';
```

- Always include the `.js` extension. Cloudflare Workers / miniflare resolve
  relative paths and will not auto-append.
- Imports are **always relative** (`./foo.js`, `../src/foo.js`). There are
  no path aliases, no `tsconfig.paths`, no `package.json#imports`.
- `node:` prefix is used for Node built-ins in test/setup contexts:
  `import { generateKeyPairSync } from 'node:crypto'` (`vitest.config.js`).
- Cloudflare-runtime imports use the special `cloudflare:test` specifier in
  test files: `import { env, fetchMock } from 'cloudflare:test'`.

CommonJS is **not** used anywhere in `src/` or `test/`. A few vendored
files in `src/vendor/` (`autoconsent.playwright.js`) are exempt as
third-party code.

---

## 2. File naming

Sampled across `src/` (85 files):

```
src/auth.js
src/billing.js
src/capture.js
src/cdxj.js
src/db.js
src/ip-hash.js
src/log.js
src/rate-limits.js
src/stripe-webhook.js
src/threat-check.js
src/url-validation.js
src/admin/admin-auth.js
src/admin/admin-shell.js
src/email/email-tokens.js
src/email/templates/capture-failure.js
src/ui/ui-detail.js
src/ui/ui-shell.js
src/ui/ui-submit.js
src/vendor/autoconsent.playwright.js
```

Rules in evidence:

- **kebab-case** for filenames (`ip-hash.js`, `url-validation.js`,
  `stripe-webhook.js`). Never camelCase, never PascalCase.
- **Subsystem prefix inside subdirectories.** Files under `src/admin/`,
  `src/email/`, and `src/ui/` are prefixed with the directory name
  (`admin-auth.js`, `email-tokens.js`, `ui-detail.js`). This is necessary
  for `src/ui/` because all UI modules concatenate into one global script
  (see §10).
- **Test files mirror source filenames** under `test/` with a
  `.test.js` suffix: `src/capture.js` → `test/capture.test.js`,
  `src/log.js` → `test/log.test.js`.
- One file per top-level concern. `src/index.js` is the routing entry;
  every other file is a focused module (`capture.js`, `signing.js`,
  `quotas.js`, …).

---

## 3. Function and variable naming

- **Functions:** `camelCase` verbs. `performCapture`, `verifyApiKey`,
  `hashApiKey`, `extractBearerToken`, `getOrCreateSession`,
  `problemResponse`. Handlers are prefixed with `handle`:
  `handleCreateCapture`, `handleListCaptures`, `handleAdminCreateKey`.
- **Constants:** `SCREAMING_SNAKE_CASE` for module-level constants and
  regexes. Examples:
  - `TENANT_ID_RE`, `SCHEDULE_ID_RE` (`src/db.js`)
  - `RATE_LIMITS`, `FREE_CAPTURE_LIMIT` (`src/rate-limits.js`, `src/quotas.js`)
  - `FAVICON_SVG`, `DESIGN_SYSTEM_CSS`, `UI_CSS`
  - `TEST_HTML`, `TEST_URL`, `TEST_IP`, `PNG_BYTES` (`test/fixtures.js`)
- **Module-private helpers:** lowercase camelCase, often without a JSDoc
  block; module-internal mutable state uses a leading underscore:
  ```js
  // src/ip-hash.js
  let _cachedKey = null;
  let _cachedDate = '';
  ```
- **Auth result objects:** `{ ok: true, ... }` / `{ ok: false, reason, response }`.
  The discriminant is always `ok`. See `src/auth.js` `extractBearerToken`,
  `verifyApiKey`, `verifySession`.
- **Numeric severities** (Coralogix): `3 = info`, `4 = warn`, `5 = error`.
  Documented in `src/log.js`, used as bare numbers in call sites.
- **Identifier prefixes** are used as type tags in URLs and DB rows:
  `cap_<32hex>` (capture), `sch_<32hex>` (schedule), `whk_<32hex>` (webhook),
  `gh-<id>` (GitHub-derived tenant), `wrl_live_<43chars>` (API key).

---

## 4. Error handling — fail loudly, never silently

`CLAUDE.md` is explicit: **silent `catch {}` blocks are forbidden.** Every
catch must either log via `log(env, …)` or handle a specific named error
type. Status responses must distinguish `'error'` (service unavailable)
from `'skipped'` (intentionally degraded).

The two patterns observed in the codebase:

**Pattern A — log and return a structured response** (most handlers):

```js
// src/billing.js
} catch (err) {
  ctx.waitUntil(log(env, 5, 'billing', {
    event: 'billing.checkout_error',
    cip,
    tenantId,
    error: err.message,
    responseStatus: 500,
  }) ?? Promise.resolve());
  return problemResponse(500, 'Failed to create checkout session', BILLING_CACHE);
}
```

**Pattern B — log and fall through to a degraded path**, with a
distinguishing reason code:

```js
// src/auth.js
try {
  record = await getApiKeyRecord(env.DB, sha256hex);
} catch (err) {
  // D1 I/O failure: fail loudly, do NOT fall through to legacy
  log(env, 5, 'security', { event: 'security.kv_error', errorMessage: String(err?.message ?? '').slice(0, 128) });
  return {
    ok: false,
    response: problemResponse(500, 'Authentication service error'),
    reason: 'kv_error',
    keyHashPrefix: sha256hex.slice(0, 8),
  };
}
```

**Truncation rule.** When logging error messages from third-party libs
(Playwright, fetch, D1), strings are clamped to keep payloads bounded:
`String(err?.message ?? '').slice(0, 128)`. This appears in `auth.js`,
`log.js`, `capture.js`, and elsewhere.

**Use of `??` for `waitUntil`.** Because `log()` returns `undefined` when
Coralogix bindings are absent, callers wrap with `?? Promise.resolve()`
so `ctx.waitUntil()` never receives `undefined`:

```js
ctx.waitUntil(log(env, 4, 'capture', { ... }) ?? Promise.resolve());
```

**Bare-`catch` exceptions found.** A handful of files (`src/account.js`,
`src/cache.js`, `src/admin.js`, `src/billing.js`) use `} catch {`, but
each is paired with an immediate degraded response and a comment
explaining the intent — they are not silent swallowers. Example:

```js
// src/cache.js
export function getCache(env) {
  if (env?.ENABLE_EDGE_CACHE !== 'true') return null;
  try {
    return caches.default;
  } catch {
    return null;
  }
}
```

The accompanying comment documents that the Cache API hangs in the
workerd test runtime, so the catch is the documented degradation path,
not a hidden failure.

---

## 5. Logging — `log(env, severity, subsystem, data)`

All structured logging routes through `src/log.js`. From the JSDoc and
implementation:

```js
// src/log.js
/**
 * Ships a structured log entry to Coralogix. Fire-and-forget.
 * Returns the fetch Promise so callers CAN pass it to ctx.waitUntil().
 * Returns undefined (no-op) if CORALOGIX_ENDPOINT or CORALOGIX_SEND_KEY
 * is absent (local dev, tests, preview environments).
 *
 * @param {object} env Worker env bindings
 * @param {number} severity Coralogix severity: 3=info, 4=warn, 5=error
 * @param {string} subsystem Module name: "capture", "security", "oauth"
 * @param {object} data Structured payload (event, captureId, stage, etc.)
 * @returns {Promise<void>|undefined}
 */
export function log(env, severity, subsystem, data) { ... }
```

### Mandatory call shape

```js
log(env, 5, 'security', { event: 'security.kv_error', errorMessage: '...' });
log(env, 4, 'capture',  { event: 'capture.session_connect_fail', captureId, stage: 'connect' });
log(env, 3, 'billing',  { event: 'billing.checkout_created', cip, tenantId });
```

- `data.event` is a stable, dotted, machine-readable name
  (`security.kv_error`, `capture.session_connect_fail`, `billing.checkout_error`).
- `data` MUST contain only static / pre-validated fields. The function's
  doc lists what may **never** be logged: raw API keys, raw IPs (use
  `computeCip` from `src/ip-hash.js`), Authorization values, full key
  hashes (use the 8-char prefix), unvalidated request bodies, OAuth codes,
  session cookie values, email addresses.

### `console.*` is forbidden

`grep -rn 'console\.' src/` finds only documented exceptions:

| File | Reason |
|---|---|
| `src/log.js` | Coralogix can't log its own delivery failures |
| `src/ip-hash.js` | Pure utility with no `env` access |
| `src/capture.js` (one site) | Internal browser-session helper without `env` |
| `src/vendor/autoconsent.playwright.js` | Vendored third-party code |

The comment in `CLAUDE.md`: *"`console.*` calls are invisible in
production unless someone runs `wrangler tail` at the exact right moment."*

---

## 6. Async patterns

- **`async`/`await` exclusively.** No raw `.then()` chains in `src/`,
  except trailing `.catch()` on fire-and-forget log delivery in `log.js`.
- **`ctx.waitUntil()`** is used for all post-response side effects
  (logging, metering, cache puts) so the response returns within the
  300ms latency budget while telemetry continues.
- **`Promise.all`** is used for parallel I/O — see `test/capture.test.js`
  R2 cleanup or `src/capture.js` artifact uploads.
- **Idempotent cleanup.** Cleanup helpers (`cleanupCapture`, `cleanDb`)
  are written so they can be called from `beforeEach` and `afterEach`
  without checking prior state.

---

## 7. TypeScript vs JavaScript — JSDoc-typed JS

The project is **JavaScript with JSDoc**, not TypeScript. The only `.ts`
file in the repo (excluding vendored / tooling) is `vitest.sync.config.ts`,
which exists only because `vitest/config` types resolve cleanly there.

Public functions and exported helpers carry JSDoc with full param/return
types:

```js
// src/auth.js
/**
 * Hashes a raw API key with SHA-256, returning lowercase hex.
 * Used for KV lookup and safe logging (prefix only). Compute once per request.
 *
 * @param {string} rawKey
 * @returns {Promise<string>} 64-character lowercase hex string
 */
export async function hashApiKey(rawKey) { ... }
```

Cloudflare runtime types (`D1Database`, `ExecutionContext`, `Request`,
`Response`) appear as JSDoc references; no `@cloudflare/workers-types`
import is required because Workers globals are ambient at runtime.

There is **no** `tsconfig.json` and **no** type-check step in CI. JSDoc
serves documentation, not compile-time enforcement.

---

## 8. Comment style

Three layers:

1. **File-level header.** Each module starts with a `/* ... */` block
   describing purpose, trust boundary, and the test file. Example:

   ```js
   // src/auth.js
   /*
    * auth.js -- API key authentication for the Web Resource Ledger Worker
    *
    * Trust boundary: the Authorization header is untrusted caller input.
    * ...
    * Tests: test/auth.test.js
    */ // tva
   ```

   The trailing `// tva` marker is a project-wide tag (do not remove when
   editing existing files; copy it on new files).

2. **Function JSDoc.** `/** ... */` with `@param`/`@returns`. Used on
   every exported function and most non-trivial internal helpers.

3. **Section banners** inside larger files use the `// ---...` style:

   ```js
   // ---------------------------------------------------------------------------
   // verifyApiKey -- KV-based key lookup
   // ---------------------------------------------------------------------------
   ```

Inline comments are reserved for **why**, not **what**. Look at
`src/cache.js`'s comment about workerd hanging on `caches.default`, or
`vitest.config.js`'s comment explaining why `[[queues.consumers]]` is
omitted in the test config.

---

## 9. Imports style

- Always relative, always `.js`-suffixed. (See §1.)
- One named-import statement per source module. Avoid default exports.
- No barrel re-exports (no `index.js` re-exporters inside subdirectories).
  `src/index.js` is the *Worker* entry, not a barrel.
- Top-of-file ordering, by convention:
  1. Third-party / runtime imports (`cloudflare:test`, `@cloudflare/playwright`).
  2. Local imports, grouped roughly by subsystem (responses, auth, db, …).
  3. `log` import last, because it's used everywhere.
- Test files commonly destructure helpers from `./fixtures.js`:
  ```js
  import { TEST_ADMIN_KEY, TEST_TENANT_KEY, seedApiKey, cleanDb } from './fixtures.js';
  ```

---

## 10. Dashboard UI — `src/ui/` global-scope rule

This is a project-specific gotcha that has caused production bugs.

`src/ui/ui-shell.js` builds the dashboard HTML by concatenating every
view module's exported JS string into one `<script>` block:

```js
// src/ui/ui-shell.js
import { AUTH_JS } from './ui-auth.js';
import { DETAIL_VIEW_JS } from './ui-detail.js';
import { SUBMIT_VIEW_JS } from './ui-submit.js';
// ...
const html = `<!DOCTYPE html>...
<script>
(function () {
'use strict';
// === AUTH ===
${AUTH_JS}
// === VIEW: DETAIL ===
${DETAIL_VIEW_JS}
// === VIEW: SUBMIT ===
${SUBMIT_VIEW_JS}
// ...
})();
</script>`;
```

**Every view module exports a `string` constant**, not real ES module
exports. Inside that string, `function loadCaptures(...)` declares a
function in the **shared IIFE scope** alongside every other view's
function. A name collision silently shadows.

### Rules when editing `src/ui/`

1. **Prefix function names by view.** Confirmed examples in code:
   - `src/ui/ui-detail.js`: `loadCompareCaptures`, `renderDetailComplete`,
     `renderDetailPending`, `buildCompareSection`.
   - `src/ui/ui-submit.js`: `buildCaptureItem`, `updateCaptureItem`,
     `startElapsedTimer`, `stopElapsedTimer`, `stopAllElapsedTimers`.
   Use `<view>_<name>` (`detail_loadCaptures`) or pick a globally
   unique name (`loadCompareCaptures`).

2. **Grep before adding a function.** Before adding `function foo()` to
   any `src/ui/*.js`:
   ```bash
   grep -n "function foo\b\|var foo\b\|let foo\b\|const foo\b" src/ui/*.js
   ```

3. **Module-level variables are also global.** `_listEl`, `_captures`,
   `_cachedKey` style identifiers — prefix them too.

4. **No frameworks.** Plain DOM APIs only — `document.createElement`,
   `el.textContent =`, `el.classList.add`. Example pattern from
   `src/ui/ui-detail.js`:
   ```js
   function buildBackLink() {
     var back = document.createElement('a');
     back.href = '#/captures';
     back.className = 'detail-back-link';
     back.textContent = 'Back to captures';
     return back;
   }
   ```
   Note: UI string code uses `var` (not `const`/`let`) for compatibility
   with the embedded-script context. The rest of `src/` uses `const`/`let`.

---

## 11. Helix Manifesto in practice

| Principle | How it shows up here |
|---|---|
| **YAGNI** | No speculative auth providers, no plugin systems. `verifyApiKey` only handles the auth methods actually shipped. |
| **KISS** | Routes table in `src/index.js` is a flat array of `[method, regex, handler]` tuples — no router framework. |
| **Lean & mean** | 9 runtime dependencies in `package.json`. No React, no Tailwind, no jQuery. |
| **Vanilla over framework** | Dashboard (`src/ui/`) uses raw DOM APIs; CSS is hand-written in `src/design-system.css` + `src/ui/ui-css.js`. |
| **Latency <300ms** | All third-party I/O wrapped in `ctx.waitUntil()`; `getCache(env)` is opt-in via `ENABLE_EDGE_CACHE` to allow short-circuiting hot paths. |
| **Ops reliability** | Health endpoint at `/health`; structured logs key on `event` so Coralogix alerts can target stable names. |
| **More code, less blah** | Routes are one-line tuples, not config objects with options. |

Whenever a PR proposes a new dependency, the standing question is the
one from `CLAUDE.md`: *"What does this dependency give me that I can't
do simply without it?"*

---

## 12. Lint / format config

There is **no** ESLint, Prettier, Biome, or stylistic formatter
configured in this repo. The only lint step is API-schema lint:

```json
// package.json
"lint:api": "redocly lint openapi.yaml"
```

`scripts/check-version-sync.sh` runs in CI to ensure version markers stay
in sync, but it is not a code linter.

Conventions in this document are enforced by **review**, not tooling.
When in doubt, match the surrounding file's style:

- 2-space indentation, single quotes, semicolons present.
- Trailing commas in multi-line object/array literals.
- Arrow callbacks for short transforms; named `function` declarations
  for top-level definitions.
- No unused imports, no unused variables.
