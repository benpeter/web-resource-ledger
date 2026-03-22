## Task 4: Unit Tests for Usage Counter DAL + computePeriod

You are writing unit tests for the usage counter data access layer functions
in src/db.js. These tests exercise the DAL directly against a real D1 database
(miniflare-backed), NOT through HTTP endpoints.

### Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/wise-wondering-lerdorf

### What to create

**`test/usage-counters.test.js`** — A new test file with ~17-20 tests.

### Test structure and conventions

Follow the patterns from existing tests (test/db.test.js, test/admin-keys.test.js):

```js
// tva
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { computePeriod, incrementUsage, getUsage } from '../src/db.js';
import { cleanDb, seedUsageCounter } from './fixtures.js';

beforeEach(async () => {
  await cleanDb(env.DB);
});
```

### Tests to write

**describe('computePeriod')**:
1. returns YYYY-MM for current date (check format matches /^\d{4}-\d{2}$/)
2. returns correct period for a specific date (new Date('2026-03-15T10:00:00Z') → '2026-03')
3. returns correct period for January (new Date('2026-01-01T00:00:00Z') → '2026-01')
4. returns correct period for December (new Date('2025-12-31T23:59:59Z') → '2025-12')
5. returns correct period at UTC midnight boundary (new Date('2026-04-01T00:00:00Z') → '2026-04')

**describe('incrementUsage')**:
6. creates new row on first increment (increment captures:1, then getUsage should show 1)
7. increments existing row (seed with captures:5, increment captures:3, expect 8)
8. increments multiple counters atomically (captures:1, storageBytes:1024, apiCalls:1)
9. no-op when all deltas are zero (increment {captures:0, storageBytes:0, apiCalls:0}, verify no row created)
10. no-op when deltas object is empty ({})
11. handles large storageBytes (increment storageBytes: 50*1024*1024, verify exact value)
12. multiple increments accumulate (three sequential increments, verify sum)
13. different periods create separate rows (increment for 2026-03, then manually seed 2026-02, verify both exist independently)

For test 13, you'll need to use seedUsageCounter for the second period since incrementUsage
always uses the current period. Alternatively, test that calling incrementUsage twice results
in the same row being updated (not creating a second row for the same period).

**describe('getUsage')**:
14. returns zero-defaults for nonexistent tenant (getUsage for random tenant → all zeros)
15. returns zero-defaults for nonexistent period (seed a row for 2026-03, query 2026-02 → zeros)
16. returns seeded values correctly (seed with captureCount:10, storageBytes:5000, apiCallCount:20)
17. returns camelCase field names (verify keys are tenantId, period, captureCount, storageBytes, apiCallCount, updatedAt)

**describe('schema constraints')**:
18. period CHECK constraint rejects invalid format (try INSERT with period='2026-3', expect error)
19. period CHECK constraint rejects wrong length (try INSERT with period='2026-031', expect error)
20. non-negative CHECK constraint prevents negative values (try INSERT with capture_count=-1, expect error)

For constraint tests, use raw `env.DB.prepare()` since the DAL functions enforce valid inputs.

### Conventions
- Use `env.DB` from 'cloudflare:test' — real D1 via miniflare
- Use `cleanDb(env.DB)` in beforeEach
- Use `seedUsageCounter` from fixtures when you need pre-existing data
- Test exact values, not just truthiness
- For the tenant prerequisite, seedUsageCounter handles INSERT OR IGNORE into tenants
- For schema constraint tests, use try/catch and expect the error to be thrown

### What NOT to do
- Do NOT import SELF or make HTTP requests (that's integration tests, Task 5)
- Do NOT modify any source files
- Do NOT modify fixtures.js (seedUsageCounter already exists)
- Do NOT mock D1 — use the real miniflare-backed database
