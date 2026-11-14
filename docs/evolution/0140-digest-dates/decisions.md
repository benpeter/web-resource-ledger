# Decisions

- The template's JSDoc already asked for dates like "Mar 17"; the caller passed ISO
  timestamps. The caller now formats them (`en-US`, short month, UTC), the way the
  limit-reached email formats its period at the call site. The template is unchanged.
- `handleWeeklyDigest` takes `now`, and the weekly cron passes its scheduled time, as
  `runRetentionJobs` does. The period then doesn't drift with how late the job starts,
  and a test can pin it.
- The unused `dedupPeriod` argument and the JSDoc line saying the digest is
  deduplicated by month are gone: neither was true, and the second one sent this
  investigation looking for missing `notification_sent` rows.
- Backlog #19 itself (nudge after the first capture, digest for any capture) stays
  open: its trigger, a first activation cohort, isn't met while the founder is the only
  tenant with captures.
