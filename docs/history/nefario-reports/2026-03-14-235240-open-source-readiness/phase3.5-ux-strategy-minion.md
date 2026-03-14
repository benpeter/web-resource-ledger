ADVISE

- [ux-strategy]: CI action SHAs in Task 1 prompt may be stale at execution time, undermining the open-source hygiene signal the phase is designed to create
  SCOPE: `.github/workflows/ci.yml` in Task 1
  CHANGE: Strengthen the verification instruction so it is unambiguous. Currently "verify these are the latest stable SHAs" is a soft suggestion that an agent could skip or satisfy superficially. Reframe it as a blocking check with explicit success criteria: fetch the releases page for both actions, compare the latest release SHA to the prompt value, and use the fetched value regardless. Make it a numbered step with an expected output, not an inline IMPORTANT note.
  WHY: First-time contributors will read this workflow file. A visibly stale SHA (or a version mismatch between the SHA and the comment) signals poor maintenance hygiene on the repo's most prominent new file — the opposite of what this phase intends to communicate.
  TASK: Task 1 (Step 5)
