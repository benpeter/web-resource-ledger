ADVISE

---

- [security]: The `_` wildcard in LIKE patterns is not blocked, allowing `_` to match any single character in URL prefix queries.
  SCOPE: `src/db.js` -- `listCaptures`, the `AND url LIKE ? || '%'` clause
  CHANGE: Escape `_` in the url parameter before binding: replace `_` with `\_` and append `ESCAPE '\'` to the LIKE expression -- `AND url LIKE ? || '%' ESCAPE '\'`. The plan already blocks `%` (good); `_` must be handled identically.
  WHY: A query for `https://exam_le.com` would match `https://example.com` and `https://examale.com` etc. While the impact at WRL's current scale is low (within-tenant only, no cross-tenant leak), it is a correctness-as-security issue: the filter returns records the caller did not ask for, and the precedent of unbounded wildcards is dangerous if row counts grow. The fix is a one-liner.
  TASK: Task 2

- [security]: The migration script credential handling is unspecified -- the plan says "use Cloudflare REST API for KV reads and D1 writes" but gives no guidance on how the API token is sourced or handled.
  SCOPE: `scripts/migrate-kv-to-d1.js` -- credential sourcing and lifecycle
  CHANGE: The prompt for Task 3 must explicitly instruct the agent to: (1) read the Cloudflare API token from the environment (`CLOUDFLARE_API_TOKEN`) or `~/.secrets` via `source ~/.secrets`, never hardcode or accept it as a CLI argument; (2) avoid logging the token value; (3) add a comment warning that the token needs `D1:write` and `KV:read` permissions (principle of least privilege -- not the account-level token). The script is one-time operational tooling but it will be committed to the repo and run by humans -- the token handling pattern matters.
  WHY: Migration scripts are a common source of credential leakage. The token will grant read access to all KV data (including API key hashes) and write access to D1. If the script pattern accepts the token as `--token` CLI arg, it appears in `ps aux` output and shell history. If it logs the token value on error, it appears in terminal history and CI logs.
  TASK: Task 3

- [security]: The `auth.js` migration from `env.KV` to `env.DB` preserves the existing SHA-256 hash lookup, which is correct. However, the plan instruction for `getApiKeyRecord` in `db.js` says "SELECT from api_keys" without specifying that the lookup must remain hash-only -- the plan must not introduce a plaintext key comparison path.
  SCOPE: `src/db.js` -- `getApiKeyRecord`, `src/auth.js` -- `verifyApiKey`
  CHANGE: The Task 2 prompt already describes `getApiKeyRecord(db, sha256hex)` as a hash-based SELECT, which is correct. Add an explicit note to Task 2: "Do NOT add any path that compares plaintext tokens to stored values. The only stored credential is the SHA-256 hash. auth.js must continue to hash the token before calling getApiKeyRecord." This is a verification reminder, not a design change.
  WHY: The existing auth.js is well-hardened (timing-safe comparison for legacy key, hash-only storage for KV keys). A refactor creates opportunity to accidentally introduce a `WHERE raw_key = ?` path. Making this explicit in the prompt closes the risk.
  TASK: Task 2

- [security]: Signing key private key material must never be stored in D1. The schema correctly stores only `public_key` in the `signing_keys` table, but the plan's prompt for Task 2 does not explicitly state this boundary.
  SCOPE: `migrations/0001_initial_schema.sql` -- `signing_keys` table; `src/db.js` -- `archiveSigningKey`
  CHANGE: Add one sentence to the Task 2 prompt: "The signing_keys table stores ONLY public keys. Private key material lives exclusively in Wrangler secrets (SIGNING_KEY env var). The archiveSigningKey function must reject any value that is not a 32-byte Ed25519 public key -- the existing kv.js byte-length validation must be preserved."
  WHY: The existing kv.js `archiveSigningKey` already validates 32-byte length, but the migration brief does not explicitly call out the private/public boundary. If a future agent misreads the function name as "archive the key pair", it could attempt to store private key bytes. The 32-byte check is the guard, but naming it explicitly in the prompt is defense-in-depth.
  TASK: Task 2

---

None of these are blocking. The core security properties of the design are sound:
- All D1 queries use parameterized bindings (no string interpolation into SQL)
- Tenant isolation is enforced via `WHERE tenant_id = ?` with the authenticated tenant ID from auth, not from user input
- API key lookup remains hash-only (SHA-256)
- The `%` wildcard is already rejected in the url filter
- The `_` wildcard issue (first finding) is the only meaningful injection gap, and it is within-tenant

The design is approvable with the LIKE escaping fix confirmed in Task 2.
