---
task: Evaluate HAR vs WACZ archive format and Playwright HAR recording
date: 2026-03-16
slug: har-vs-wacz-format-evaluation
mode: advisory
task-count: 0
gate-count: 0
compaction-events: 0
---

## Summary

Two specialists evaluated whether WRL should switch from WACZ to HAR format and whether Playwright's `recordHar()` is usable. Answer: do not switch (WACZ has ISO standardization, institutional adoption, signing — HAR has none), and `recordHar()` is non-functional on Cloudflare Workers (three independent source-code blockers). If richer network metadata is ever needed, the viable path is an application-level serializer built on existing route interceptor events, not Playwright's HAR API.

## Original Prompt

Should we switch the archive format to HAR? Are we already taking advantage of the Playwright capability for that?

## Key Design Decisions

1. **Stay on WACZ/WARC** — ISO 28500, Library of Congress/NARA/Internet Archive adoption, Ed25519 signing, chain-of-custody tooling. HAR has zero legal evidence pedigree (W3C abandoned in 2012). Switching would regress WRL's evidence positioning.
2. **Do not use Playwright recordHar()** — Three independent blockers in `@cloudflare/playwright@1.1.2`: `fs.writeFileSync()` in HarRecorder, filesystem-dependent Artifact model, null `localUtils` in thin-client connection. Not a platform gap — an architectural incompatibility.
3. **Future enrichment path identified** — The existing `context.route('**/*')` and `page.on('response')` hooks already observe all sub-resource traffic but discard the metadata. An application-level HAR serializer could capture this data and embed it as a WARC metadata record inside WACZ. M-sized work item, no Playwright HAR APIs needed.

## Phases

### Phase 1: Meta-Plan
Identified 2 specialists: gru (format comparison, technology landscape), iac-minion (Cloudflare Workers feasibility gate). Lean staffing — focused technical advisory on a format comparison question.

### Phase 2: Specialist Planning
- **gru**: HAR is not a replacement for WACZ (different purposes: performance analysis vs preservation). HAR data is valuable as a capture mechanism. Hybrid approach (HAR → WARC metadata) is architecturally sound. Recommended spike test.
- **iac-minion**: Definitive source-code analysis proving `recordHar()` is non-functional on Workers. Three independent blockers. Recommended application-level serializer if HAR data is ever needed.

### Phase 3: Synthesis
Resolved feasibility conflict in iac-minion's favor — source-code blockers are deterministic, making a spike test redundant. Produced unified recommendation: stay on WACZ, skip spike test, document decision, set revisit trigger.

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Key Contribution |
|-------|-------|-----------------|
| gru | planning | Format comparison (ISO 28500 vs abandoned W3C draft), hybrid architecture analysis, data enrichment opportunity identification |
| iac-minion | planning | Source-code analysis of @cloudflare/playwright proving recordHar() non-functional, memory/timing budget assessment, alternative path recommendation |

## Team Recommendation

### Executive Summary

Do not switch to HAR. Do not attempt Playwright's `recordHar()`. Stay on WACZ/WARC. The format has ISO standardization, institutional adoption, and signing support that HAR lacks entirely. The Playwright HAR API is architecturally incompatible with Cloudflare Workers. If richer network metadata is ever needed, build an application-level serializer from the request/response events already flowing through the existing route interceptor.

### Consensus
- HAR is not a replacement for WACZ (both agree)
- WRL is not using and cannot use `recordHar()` (both agree)
- The data HAR captures is genuinely valuable even if the format is not (both agree)
- Future enrichment path is application-level, not Playwright API (both agree)

### Dissenting View (resolved)
gru recommended a spike test for `recordHar()` on Workers `/tmp`. iac-minion's source-code analysis showed three independent blockers at the code level (before filesystem is ever reached). Resolution: spike test unnecessary — the blockers are deterministic.

### Conditions to Revisit
1. Cloudflare announces native HAR support in `@cloudflare/playwright`
2. A user or integration partner requests richer network metadata in captures
3. The application-level serializer path becomes a roadmap item

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Compaction</summary>

0 compaction events during this session.

</details>

## Working Files

[`docs/history/nefario-reports/2026-03-16-091706-har-vs-wacz-format-evaluation/`](./2026-03-16-091706-har-vs-wacz-format-evaluation/)

Files: prompt.md, phase1-metaplan.md, phase2-gru.md, phase2-iac-minion.md, phase3-synthesis.md (+ corresponding -prompt.md files)
