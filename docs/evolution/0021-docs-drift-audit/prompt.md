Audit documentation for drift against recent code changes

**Outcome**: All project documentation accurately reflects the current state of the codebase after recent issues and PRs, so that developers and users aren't misled by stale instructions, outdated API references, or missing coverage for new features.

**Success criteria**:
- Each recent issue/PR is checked for documentation impact (new features, changed behavior, removed functionality)
- Every identified drift is catalogued with the specific doc file, what's wrong, and the issue/PR that caused it
- All identified documentation gaps are fixed or filed as issues
- README, API docs, and any user-facing guides match current behavior

**Scope**:
- In: All documentation in the repo (README, docs/, inline API docs, configuration references), recent closed issues and merged PRs as the change source
- Out: Evolution log history (those are historical records, not living docs), external documentation hosted outside this repo
