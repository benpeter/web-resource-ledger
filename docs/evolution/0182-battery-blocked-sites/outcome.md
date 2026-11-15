# Outcome

- Red first (57451ef): four tests failed, a block page counted as a consent
  regression, a failed 403 as a capture regression, an unblocked site as an
  improvement, and the report had no status or count. Green in bb61100.
- `scripts/lib/battery-compare.js`: `errorStatus()`, the `blocked` verdict,
  the status in the report's baseline and candidate columns, the count.
- `scripts/test-battery.js`: `httpStatus` in the results file and an HTTP
  column in the printed table.
- `test/battery-compare.test.js` 21 passed.

## Backlog changes

- #100 comment: the battery no longer compares etsy.com and other sites that
  refuse the browser, so it can stay in the default set.
