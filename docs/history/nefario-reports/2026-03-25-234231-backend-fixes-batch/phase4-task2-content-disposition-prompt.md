## Task: Descriptive Content-Disposition filenames for artifact downloads (#181)

### Problem
Artifact download responses currently use generic filenames (`screenshot.png`, `bundle.wacz`, etc.) in the `Content-Disposition` header. Users downloading multiple captures get identically-named files.

### What to do
Modify `handleGetCaptureArtifact()` in `src/index.js` to build descriptive filenames using data from the `record` object (which is already fetched from D1 via `getCapture()`). Pattern: `capture-{domain}-{date}.{ext}`.

### Implementation steps

**Step 1: Add a filename builder function** before `handleGetCaptureArtifact` (around line 1720):
- Parse `record.url` with `new URL()` to get hostname
- Strip leading `www.`
- Sanitize hostname: replace any char not `a-z`, `0-9`, `.`, or `-` with `-`
- Truncate domain to 100 chars
- **SECURITY ADVISORY**: Sanitize the date value too: `createdAt.slice(0, 10).replace(/[^0-9-]/g, '')` — do NOT trust raw DB values in HTTP headers
- Build filename: `capture-{domain}-{date}.{ext}`
- For `screenshot-before` artifact, add `-before` suffix: `capture-{domain}-{date}-before.png`
- Wrap in try/catch, fallback to generic filenames if URL parsing fails

Extensions map: screenshot->png, screenshot-before->png, html->html, headers->json, wacz->wacz

**Step 2: Wire it into handleGetCaptureArtifact**
Replace the static `filenames` map with a call to the new function. The `record` object is already available (fetched at the top of the handler).

### Tests
Add tests in `test/capture-retrieval.test.js`. The file already seeds captures and R2 artifacts.

Add a new describe block for Content-Disposition filenames:
1. Test screenshot filename includes domain and date
2. Test wacz filename includes domain and date
3. Test html filename includes domain and date
4. **TEST ADVISORY**: Also test screenshot-before artifact (the suffix logic is a unique code path — seed the R2 object and verify `-before` suffix appears)

For the filename builder function — either test indirectly through HTTP responses, or export it and add unit tests for edge cases: www stripping, IDN domains, long domains (truncation), bad URLs (fallback).

### Boundaries
- Only modify `src/index.js` (add function + update handler)
- Only add tests in `test/capture-retrieval.test.js`
- Do NOT modify `src/db.js` or any other source file
- Do NOT add `filename*` (RFC 5987 UTF-8 encoding) — all filenames are ASCII after sanitization
- Run `npx vitest run test/capture-retrieval.test.js` to verify your new tests pass
- Run `npx vitest run` to verify no existing tests break

### Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/jolly-cooking-dijkstra
