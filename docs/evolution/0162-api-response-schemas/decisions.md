# Decisions

- `tenant_id` comes out of schedule responses instead of going into the
  reference: it was the raw D1 column, snake_case among camelCase fields, and only
  told callers their own tenant id. `rowToSchedule` keeps it because the scheduler
  groups due schedules by tenant; `publicSchedule()` in `src/schedules.js` drops it
  from the four responses. No MCP tool printed it.
- Everything else the responses carry is documented as it is: the change-summary
  counts, `capture.url` and `signing.qualifiedTimestamp` in verify responses,
  `changeSummary` and `updatedAt` on schedules, `updatedAt` in the admin usage
  history. `ChangeSummary` is now one component used by captures and schedules.
- The `qualifiedTimestamp` check was missing from the `VerificationCheck.name`
  enum, so a client validating against the reference would reject the verify
  response of every qualified capture. Same miss as the README and MCP guide had
  (fixed in #390).
- `nextRunAt` was documented as null while paused; pausing leaves it as it was and
  resuming computes a new one (phase 0132). The reference says that now.
- A schedule's `changeSummary` is only joined in by the list query. Documented as
  such rather than adding a join to the other three responses.
- The audit script stays outside the repo (`/Users/ben/projects/wrl/bin/api-audit.mjs`):
  it needs production keys and covers GETs only.
