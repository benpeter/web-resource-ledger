# Decisions

- `scripts/test-battery.js` keeps each capture's data center as `colo` (from
  `captureSettings.browserLocation`) and shows it in its summary table.
- `compareBattery`: when both runs of a site have a `colo`, they differ, and
  the only thing that got worse is the consent result, the verdict is
  `location`, not `regression`. The weekly workflow then doesn't fail, and the
  PR's table still lists the site, second after regressions, with both data
  centers.
- A failed capture or a partial render stays a regression in any data center:
  the place changes which banner a site shows, and nothing seen so far says it
  makes captures fail.
- Results without a `colo` (older runs, a failed location read) compare as
  before.
