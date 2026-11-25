# Outcome

- Red first (7b8e07d): a lost banner in another data center is `location`;
  in the same data center, or with a failed capture, or without a data center,
  it stays a regression; the report names both data centers and counts
  location changes. Green with the change: test/battery-compare.test.js 26 passed.
- The weekly workflow is unchanged: `battery-compare.js` exits 0 when there is
  no regression, so a `location` row doesn't fail it.
