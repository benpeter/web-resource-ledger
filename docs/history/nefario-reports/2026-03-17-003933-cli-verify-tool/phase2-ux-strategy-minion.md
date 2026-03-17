# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Two audiences, one output -- layered by default, not by flag

The planning question frames this as "technical users" vs. "non-technical users." This is the wrong axis. The real axis is **what job they are hiring this tool for**:

- **Job A: Confirm authenticity.** "I have a capture file. Is it legit?" (Lawyer attaching it to evidence, journalist citing it in a story, compliance officer filing it.)
- **Job B: Diagnose failure.** "Verification failed. What broke and why?" (Developer debugging a pipeline, forensic analyst investigating tampering.)

These are *sequential* jobs on the same output, not *parallel* audiences needing different views. The default output should serve Job A immediately (the first line answers the question), then serve Job B without requiring a flag (the check details are right there, scannable).

**Do not use `--verbose`.** A verbose flag creates a decision point ("do I need verbose?") that punishes the user who guessed wrong. Instead, the default output should show everything meaningful in a compact, scannable format. Reserve `--json` for machine consumption only.

### 2. Default human-readable output design

The output should follow this exact structure. Every element earns its place.

#### Passing case

```
Verified  capture.wacz

  File integrity        pass
  Bundle integrity      pass
  Digital signature     pass
  Timestamp imprint     pass
  Timestamp chain       pass

  Signed    2026-03-16T14:22:07Z
  TSA       DigiCert Timestamp Authority
  Hash      sha256:a1b2c3d4e5f6...

Verdict: All 5 cryptographic checks passed. This capture has not been
modified since it was signed by the capture service.
```

#### Failing case

```
FAILED  capture.wacz

  File integrity        pass
  Bundle integrity      pass
  Digital signature     FAIL  Ed25519 signature verification failed
  Timestamp imprint     pass
  Timestamp chain       skip  No certificate chain available

  Signed    2026-03-16T14:22:07Z
  Hash      sha256:a1b2c3d4e5f6...

Verdict: 1 of 5 checks failed. This capture cannot be verified as authentic.
```

#### Design rationale for each element

**Line 1 -- the verdict word.** "Verified" or "FAILED" is the first word on the first line. This is the Krug principle: the user who scans without reading gets the answer. The asymmetric casing is intentional -- "FAILED" in caps creates a visual interrupt that demands attention; "Verified" in title case is calm. This matches how humans process danger signals (threat response is faster than safety confirmation).

**Filename on line 1.** Confirms what was verified. When piping multiple files through a script, this is essential context. When reading a single result, it provides the reassurance "yes, this checked the right file."

**The check table.** All checks displayed always, in a fixed order. No progressive disclosure -- hiding checks behind a flag means the lawyer doesn't know they exist, and the developer has to re-run with a flag. Five lines is not information overload; it's a short checklist. Fixed order builds recognition across runs (Nielsen: consistency).

**Check naming.** Use the human-readable labels already established in the web verification page (`verify-page.js` CHECK_LABELS), not internal names. The CLI adds a 5th check that the web UI doesn't have. Proposed labels:

| Internal name      | CLI label           | Why                                                                        |
| ------------------ | ------------------- | -------------------------------------------------------------------------- |
| `artifactHashes`   | File integrity      | Matches web UI. "Artifact" is developer jargon.                            |
| `bundleHash`       | Bundle integrity    | Matches web UI. "Hash" is implementation detail.                           |
| `signature`        | Digital signature   | Matches web UI.                                                            |
| `timestamp`        | Timestamp imprint   | Distinguishes from chain check. "Imprint" maps to the RFC 3161 concept.    |
| `timestampChain`   | Timestamp chain     | New check. "Chain" is accurate and understood by both audiences.            |

**Status words.** `pass`, `FAIL`, `skip`. Lowercase pass recedes; uppercase FAIL pops. Skip is lowercase because it's informational, not alarming. Each failing or skipped check shows its detail string inline, on the same line after the status word. No separate "details" section -- that would force the user to cross-reference.

**Metadata block.** Signed time, TSA name, and hash are shown below the checks. These are secondary information for Job A users but primary for Job B users. Showing them by default (not behind a flag) means nobody has to re-run the command. The hash is truncated in display but full in `--json`.

**Verdict sentence.** A plain-English summary at the bottom. This is the copy-pasteable line for legal/compliance use. It names the count ("All 5 checks passed" or "1 of 5 checks failed") so the reader knows the scope of verification. It uses plain language ("has not been modified since it was signed") that a non-technical person can include in a document.

### 3. Exit codes

```
0  All checks passed (verified === true)
1  One or more checks failed (verified === false)
2  Usage error, I/O error, or unrecoverable runtime error
```

**Rationale:** This is the Unix convention. `0` = success, `1` = "the tool worked but the result is negative," `2` = "the tool itself couldn't run." This matters because scripts use `$?` and CI pipelines use exit codes for pass/fail gates. Conflating "verification failed" with "file not found" (both returning 1) would be a design error -- the caller can't distinguish "this capture is tampered" from "I typo'd the filename."

**Do not add more exit codes.** Three is enough. `--json` output provides all the detail a machine consumer needs. Exit codes are a coarse signal; don't try to encode check-level results into them.

### 4. JSON output (`--json`)

The `--json` flag should output a single JSON object to stdout with no other output on stdout. All human-readable messages (progress, errors) go to stderr when `--json` is active. This allows `npx @wrl/verify capture.wacz --json | jq .verified` to work cleanly.

**JSON structure:**

```json
{
  "verified": true,
  "checks": [
    { "name": "artifactHashes", "label": "File integrity", "status": "pass" },
    { "name": "bundleHash", "label": "Bundle integrity", "status": "pass" },
    { "name": "signature", "label": "Digital signature", "status": "pass" },
    { "name": "timestamp", "label": "Timestamp imprint", "status": "pass", "detail": null },
    { "name": "timestampChain", "label": "Timestamp chain", "status": "pass", "detail": null }
  ],
  "capture": {
    "bundleHash": "sha256:a1b2c3d4e5f6...",
    "signature": "base64...",
    "publicKey": "base64...",
    "signedAt": "2026-03-16T14:22:07Z",
    "timestamp": {
      "genTime": "2026-03-16T14:22:08Z",
      "tsa": "DigiCert Timestamp Authority"
    }
  },
  "source": "capture.wacz",
  "verifiedAt": "2026-03-16T15:00:00Z"
}
```

**Key design decisions:**

- **`name` (internal) + `label` (human-readable)** in the checks array. The `name` is the stable machine key; the `label` is what the CLI renders. Consumers can use either.
- **`detail` is always present** in the JSON, set to `null` when there's nothing to say. This makes parsing predictable -- no need to check for key existence.
- **`source`** records what was verified (filename or URL). Useful in automation logs.
- **`verifiedAt`** records when verification ran. This completes the evidentiary chain: "I verified this file at this time and got this result."
- **Match existing Worker structure.** The JSON output should be a superset of what the Worker `/v1/verify/{id}` returns. This means code that consumes the Worker API can consume CLI output with minimal changes. The additions (`label`, `source`, `verifiedAt`, `timestampChain` check) are additive, not breaking.

### 5. Do not add `--verbose`

Reasons:

1. **The default output already shows all checks and their details.** There is nothing useful to hide. The check table is 5 lines. The metadata is 3 lines. This is not information overload.
2. **Verbose flags create a "which mode?" decision** at every invocation. This is cognitive load for zero benefit.
3. **Users who need more detail than the default want `--json`**, not a slightly-more-detailed text format. There is no useful middle ground between "human-readable summary" and "machine-parseable complete data."
4. **If verbose is added later, it can't be removed.** Start without it. If a specific piece of information is missing from the default output and users ask for it, add it to the default -- don't create a flag.

### 6. The "skip" status: handle with care

The existing system uses `skip` to mean "this check wasn't applicable" (e.g., no RFC 3161 timestamp was obtained). This is a reasonable status but it creates an interpretation challenge for non-technical users. "Skip" could sound like "we chose not to check this" (deliberate omission) rather than "this evidence wasn't available" (absent data).

**For the CLI:** When a check has status `skip`, display the detail string. This is essential. A bare "skip" without context is ambiguous. The detail string should explain *why* in plain language:

```
  Timestamp imprint     skip  No independent timestamp was obtained for this capture
  Timestamp chain       skip  Cannot verify chain without timestamp token
```

**For the verdict sentence:** Skipped checks should be counted separately: "3 of 3 applicable checks passed. 2 checks were not applicable (no timestamp data)." This prevents the misleading impression that all 5 checks passed when only 3 ran.

### 7. Color and terminal awareness

- **Use color when stdout is a TTY, suppress when piped.** This is standard practice (`chalk` / `supports-color` or a manual `process.stdout.isTTY` check).
- **Colors:** Green for pass, red for FAIL, dim/gray for skip. No other colors. The top-line "Verified" gets green; "FAILED" gets red.
- **No emoji.** The project CLAUDE.md says avoid emoji unless requested. Beyond that, emoji in CLI output is unreliable across terminals, ssh sessions, and CI logs. Use text labels only.
- **`--no-color` flag** for explicit override. Some CI environments have TTY-like stdout but don't render ANSI codes.
- **Keep the dependency minimal.** Do not pull in a large CLI framework for color support. A 10-line `isTTY` check with raw ANSI codes is sufficient per the project's "vanilla solutions" philosophy.

### 8. Error output (exit code 2 scenarios)

When the tool cannot even attempt verification -- file not found, not a valid ZIP, network error fetching a URL -- the output should be:

```
Error: capture.wacz is not a valid WACZ file (not a ZIP archive)
```

One line. The word "Error:" prefix. The filename. What went wrong, in plain English. No stack trace (that's for `NODE_DEBUG` or a debug env var, not default output).

For `--json` error output:

```json
{
  "error": "capture.wacz is not a valid WACZ file (not a ZIP archive)",
  "verified": null,
  "checks": [],
  "source": "capture.wacz"
}
```

`verified: null` (not `false`) distinguishes "verification failed" from "verification couldn't run." A consumer checking `result.verified === false` won't accidentally treat an error as a clean failure.

### 9. Summary line for evidentiary use

The verdict sentence at the bottom of the default output is designed to be copy-pasteable into a legal document or evidence report. It should:

- State what was verified (filename or URL)
- State the outcome (passed / failed)
- State the count (N of M checks)
- State the bundle hash (the unique identifier of the capture content)
- State the verification time

For passing:

```
Verdict: All 5 cryptographic checks passed for capture.wacz
(sha256:a1b2c3...). This capture has not been modified since it was
signed by the capture service on 2026-03-16T14:22:07Z.
```

For failing:

```
Verdict: 1 of 5 checks failed for capture.wacz (sha256:a1b2c3...).
This capture cannot be verified as authentic. Failed: Digital signature.
```

The verdict is deterministic -- identical inputs produce identical verdict text. No timestamps from the local clock in the verdict itself (that goes in `verifiedAt` in JSON).

Wait -- I said "state the verification time" then "no timestamps from the local clock." Correction: the verdict sentence should NOT include the local clock time. The `verifiedAt` field in `--json` does. The human-readable verdict should be a statement about the capture, not about when you ran the tool. This keeps it stable and copy-pasteable without "I verified this at 3:02 PM" anchoring it to a moment.

### 10. URL input (`npx @wrl/verify https://...`)

When the input is a URL (fetching a WACZ from the network), the tool should:

1. Show a single-line progress indicator on stderr: `Fetching capture.wacz from https://...`
2. On success, proceed with the same output format, using the URL as the source identifier.
3. On network failure, exit 2 with: `Error: could not fetch https://... (connection refused)`.

The progress indicator goes to stderr so it doesn't contaminate `--json` stdout. No progress bar, no spinner -- one line saying what's happening. The tool should feel instant for local files (no progress indicator for local paths).

---

## Proposed Tasks

### T1: Define output format constants and check label map

Create the mapping from internal check names to human-readable labels, status display words (pass/FAIL/skip), and the verdict template strings. This is the "design system" for CLI output -- define it once, reference it everywhere.

**Depends on:** Nothing. Can start immediately.

### T2: Implement human-readable formatter

Build the function that takes a verification result object and returns the formatted string. Handle all combinations: all pass, mixed pass/fail/skip, all fail, error cases. Apply color when TTY, suppress when piped.

**Depends on:** T1 (label map).

### T3: Implement JSON formatter

Build the function that takes a verification result and returns the JSON output with the extended schema (`label`, `source`, `verifiedAt`, `detail: null` normalization).

**Depends on:** T1 (label map, for the `label` field).

### T4: Implement exit code logic

Wire up the 0/1/2 exit code strategy. Map `verified === true` to 0, `verified === false` to 1, and all I/O/parse errors to 2.

**Depends on:** T2 and T3 (formatters must be in place to know where errors surface).

### T5: Implement `--no-color` flag and TTY detection

Simple flag parsing for `--no-color` and `process.stdout.isTTY` check. No CLI framework -- raw `process.argv` parsing is sufficient for a tool with 2 flags (`--json`, `--no-color`).

**Depends on:** T2 (color is only relevant in the human-readable formatter).

### T6: Write verdict sentence generator

Separate function that composes the copy-pasteable verdict sentence. Test it independently -- this text will appear in legal documents, so edge cases matter (e.g., 0 of 5 checks passed, 3 of 3 applicable checks passed with 2 skipped).

**Depends on:** T1 (label map for naming failed checks in the sentence).

---

## Risks and Concerns

### R1: "Timestamp imprint" vs. "Timestamp chain" naming may confuse

Splitting the old single "timestamp" check into two checks (imprint + chain) introduces new terminology. Users familiar with the web verification page see one "Independent time verification" check. The CLI will show two. This is correct (they are genuinely different checks), but the transition needs clear labeling.

**Mitigation:** The detail strings for each check must explain what it verifies in plain English. "Imprint" = "the timestamp token references the correct bundle hash." "Chain" = "the timestamp authority's certificate is valid and trusted."

### R2: The verdict sentence is high-stakes text

If this tool's output is cited in legal proceedings, the verdict sentence becomes quasi-legal language. A sloppy or ambiguous verdict could undermine trust. "This capture has not been modified" is a strong claim -- it should only appear when all checks pass.

**Mitigation:** Template the verdict text carefully. Have it reviewed. Make it deterministic and testable. Do not interpolate user-supplied strings into the verdict beyond the filename and hash.

### R3: No `--verbose` is a reversible decision, but adding it later changes behavior expectations

If users request more detail in the future, the temptation will be to add `--verbose` rather than enriching the default. That's the wrong instinct. Enriching the default is almost always better -- if the new information is useful to anyone, it's useful to everyone.

**Mitigation:** Document the design principle: "Default output shows all meaningful information. `--json` provides all data. There is no intermediate verbosity level."

### R4: Color output in CI environments

Some CI environments (GitHub Actions, GitLab CI) set environment variables that suggest TTY support but don't fully support ANSI. The `NO_COLOR` environment variable convention (https://no-color.org/) should also be respected.

**Mitigation:** Check `NO_COLOR` env var in addition to `isTTY`. Support `--no-color` as explicit override.

### R5: Verdict for partial-skip scenarios needs careful wording

When 2 of 5 checks are skipped (no timestamp data), saying "All 5 checks passed" is misleading, and saying "3 of 5 checks passed" implies 2 failed. Neither is correct.

**Mitigation:** Use explicit skip counting: "3 of 3 applicable checks passed. 2 checks were not applicable (no timestamp data)." This is longer but accurate. Accuracy matters more than brevity in evidentiary text.

---

## Additional Agents Needed

**None required beyond what's already planned.** The output design is a strategy concern (this contribution), and the implementation is a coding task that doesn't need additional domain expertise. The check labels and descriptions are already established in the web verification page -- the CLI reuses them.

One note: if the verdict sentence is expected to appear in actual legal/compliance filings, a **legal review** (human, not agent) of the template language would be prudent. The phrases "has not been modified" and "cannot be verified as authentic" carry specific implications. This is outside the scope of agent planning but worth flagging for the project owner.
