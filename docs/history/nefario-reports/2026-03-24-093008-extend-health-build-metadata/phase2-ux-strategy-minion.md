# UX Strategy Analysis: /health Response Shape

## The Two Jobs This Endpoint Serves

**Job 1 -- CI deploy verification**: "When a deploy finishes, I want to confirm the expected commit is live, so I can proceed (or rollback) with confidence."

The CI script's interaction is: `curl -s .../health | jq -r '.commit'`, then compare to `$GITHUB_SHA`. The entire interaction is a single jq field access. Every level of nesting adds a jq path segment the script author must remember and type correctly.

**Job 2 -- Operator situational awareness**: "When I curl the health endpoint, I want to see at a glance what's deployed, so I can orient myself without opening dashboards."

The operator's interaction is: `curl .../health | jq .` and visually scanning the output. They need the build identity fields to stand out as a coherent group, not get lost in a wall of flat fields.

## Recommendation: One Level of Grouping

Neither fully flat nor deeply nested. Group the build metadata under a single `build` key:

```json
{
  "status": "ok",
  "build": {
    "commit": "a1b2c3d4e5f6...",
    "version": "1.4.0",
    "env": "production",
    "deployedAt": "2026-03-24T14:30:00Z"
  },
  "legal": {
    "terms": "https://...",
    "policy": "https://..."
  }
}
```

### Why This Shape

**For CI scripts (Job 1):** The jq path is `.build.commit` -- two segments, predictable, hard to mistype. Critically, this is no worse than flat: `.commit` saves one path segment but loses semantic grouping. CI scripts are written once and run forever; the one-time cost of typing `.build.commit` is negligible against the ongoing clarity of knowing exactly where build fields live. The alternative `.build | keys` is useful for debugging scripts too -- it tells you what's available in the build namespace.

**For operators (Job 2):** When you eyeball `jq .` output, grouping creates visual chunking. A flat response with 6+ top-level keys forces the operator to mentally categorize fields ("which of these are build info? which are legal?"). The `build` group creates an instant visual boundary. This directly reduces cognitive load -- the operator's eye goes to `"build"` and finds everything they need inside it, without scanning past `legal`, `status`, or any future fields.

**For forward compatibility:** Flat structures get unwieldy as fields accumulate. Today it's 4 build fields. Tomorrow it might include `buildNumber`, `branch`, or `runner`. A flat namespace forces naming conventions (`buildCommit`, `buildVersion`) which are strictly worse than structural grouping -- they're longer to type in jq, harder to scan visually, and the "namespace" is just a naming convention with no tooling support.

### Why Not Fully Flat

A flat response like `{"status":"ok","commit":"...","version":"...","env":"...","deployedAt":"...","legal":{...}}` creates two problems:

1. **Mixed concerns at one level.** Operational status, build identity, and legal metadata are three distinct categories mashed into one namespace. This violates the consistency heuristic -- `legal` gets its own group but build metadata doesn't? That asymmetry creates a "wait, why?" moment.

2. **Scanning cost grows linearly.** With flat structure, adding any future field to the response means operators must re-scan more keys to find what they want. Grouping keeps the scan target constant: find the group label, then scan within it.

### Why Not More Nesting

No need for `build.deploy.timestamp` or `build.source.commit`. One level of grouping is the sweet spot -- it gives both consumers what they need (chunking for humans, short paths for machines) without adding depth that makes jq paths tedious or output harder to scan.

## Field-Level Notes

| Field | Value | Cognitive Load Notes |
|-------|-------|---------------------|
| `commit` | Full 40-char SHA | CI needs exact match against `$GITHUB_SHA`. Truncating would force `.commit[:7]` transformations in scripts. Show full SHA; operators know to read only the first 7-8 chars visually. |
| `version` | Semver string | Immediately recognizable pattern. Good. |
| `env` | `"production"` or `"staging"` | Use full words, not abbreviations (`prod`/`stg`). Two extra characters buy instant recognition. The set is small enough that Hick's Law is irrelevant. |
| `deployedAt` | ISO 8601 UTC | Matches `legal` naming convention if it ever gets timestamps. UTC with `Z` suffix -- no timezone ambiguity. ISO 8601 is the one format both `jq` string comparison and human eyes can parse. |

## One Concern: `status` Semantics

Currently `status` is always `"ok"`. Once build metadata is present, operators may wonder: does `"status": "ok"` mean "the service is healthy" or "the response was successful"? This is a latent ambiguity, not caused by this change, but worth noting. If the endpoint ever needs to report degraded state, `status` already has the right home at the top level -- it should not move into `build`. The current shape supports this cleanly.

## Summary

Use `{ status, build: { commit, version, env, deployedAt }, legal: {...} }`. One level of grouping. It serves both jobs well, scales to future fields without restructuring, and creates the visual chunking that makes `curl ... | jq .` output immediately scannable.
