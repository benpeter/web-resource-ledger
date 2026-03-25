# Phase 3.5: Lucy Review -- Compliance Documentation Plan

## Verdict: ADVISE

The plan is well-aligned with issue #117's intent, correctly scoped to documentation-only (no code changes), and demonstrates strong CLAUDE.md compliance on YAGNI, KISS, and honesty principles. The decisions log is exemplary -- deferred code changes, manual PDF over build pipeline, flat nav over grouped nav are all correct KISS calls. Two findings require correction before execution; the rest are minor.

---

## Findings

### 1. COMPLIANCE: Wrong Eleventy layout path in all task prompts

**Severity**: HIGH -- will cause all 6 new pages to render without the doc layout.

Every task prompt specifies `layout: doc.njk` in the Eleventy frontmatter instructions. The actual project convention, verified across all 10 existing content files, is `layout: layouts/doc.njk`.

**Affected tasks**: Task 1 (subprocessors), Task 2 (data retention), Task 3 (whitepaper), Task 4 (incident response), Task 5 (DPA), Task 6 (security hub).

**Fix**: Change `layout: doc.njk` to `layout: layouts/doc.njk` in all 6 task prompts.

### 2. CONVENTION: Invented `order` frontmatter field

**Severity**: LOW -- harmless but misleading.

All task prompts specify an `order` frontmatter field (500-505). No existing content file in `site/content/` uses this field. The nav ordering is controlled by the array order in `site/_data/site.js`, not by frontmatter.

**Fix**: Remove `order` from frontmatter instructions in all task prompts to avoid confusing the executing agents into thinking this is an established convention. If Eleventy's collections use it, the `site.js` nav array already controls visible ordering.

### 3. SCOPE: Task 6 cross-linking from existing docs pages

**Severity**: LOW -- minor scope expansion, justified.

Task 6 includes editing 3 existing docs pages (`authentication.md`, `legal-evidence.md`, `index.md`) to add cross-links to the security section. Issue #117 does not explicitly request cross-linking from existing pages. However, the edits are described as "one sentence with a link" and serve discoverability of the new section. This is proportionate.

**Recommendation**: No change needed. Flagging for traceability only.

### 4. TRACE: No evolution log creation in task prompts

**Severity**: INFO -- CLAUDE.md requires evolution log entries, but these are typically handled by the orchestrator (nefario) post-execution, not by individual tasks. Noting for completeness: the plan's "Phase 8" reference and cross-cutting coverage section suggest this is handled outside the delegation plan.

**Recommendation**: Confirm that the orchestrator's Phase 8 includes evolution log directory creation and `docs/evolution/README.md` update per CLAUDE.md rules.

---

## Requirements Traceability

| Issue #117 Requirement | Plan Task | Status |
|------------------------|-----------|--------|
| Security whitepaper (architecture, trust model, encryption, access controls, key mgmt, tenant isolation, audit logging) | Task 3 (13-section whitepaper) | COVERED |
| DPA template ready for countersignature | Task 5 (Art. 28 DPA with 4 annexes) | COVERED |
| Subprocessor list (Cloudflare, Stripe, Sectigo + others) | Task 1 (8 subprocessors) | COVERED |
| Incident response procedure (detection, containment, notification) | Task 4 (7 sections) | COVERED |
| Data retention policy (periods, deletion triggers, offboarding) | Task 2 (retention table + deletion procedure) | COVERED |
| Data deletion procedure (tenant request, steps, timeline) | Task 2 (included in retention doc) | COVERED |
| Privacy policy for SaaS product | Task 7 (fix existing, not new) | COVERED -- fixes material inaccuracies rather than writing a new one, which is the right call since one already exists |
| Published on docs site and/or repo files | Tasks 1-6 (docs site), Task 8 (landing site) | COVERED |
| DPA/privacy policy GDPR checklist in outcome.md | Not in task prompts | DEFERRED to Phase 8 -- acceptable if orchestrator handles it |

**Orphaned tasks**: Task 8 (landing site trust page + footer update) is not explicitly requested in issue #117 but is a reasonable companion deliverable -- the landing site is the entry point for enterprise prospects who would need these docs. Proportionate scope expansion.

---

## CLAUDE.md Compliance Check

| Directive | Status |
|-----------|--------|
| YAGNI -- no speculative features | PASS -- code changes deferred, no PDF pipeline, no grouped nav |
| KISS -- simple beats elegant | PASS -- flat nav, manual PDF, existing HTML patterns |
| Helix Manifesto -- lean and mean | PASS -- no new dependencies, no framework additions |
| Fail loudly, degrade intentionally | N/A -- no runtime code |
| Vanilla solutions preference | PASS -- Task 8 uses existing CSS, no new JS |
| Evolution log requirement | DEFERRED -- not in task prompts, expected in orchestrator phases |
| No code changes (issue #117 scope) | PASS -- explicitly called out in Task 2's "What NOT to do" and in Decisions section |

---

## Summary

The plan is thorough, honest, and well-scoped. The approval gates on Task 3 (whitepaper) and Task 5 (DPA) are correctly placed on the highest-consequence deliverables. The "What NOT to do" sections in each task prompt are unusually good at preventing scope creep during execution.

**Required before execution**: Fix the layout path (`layouts/doc.njk`) in all 6 task prompts. This is a factual error that will cause rendering failures.

**Recommended**: Remove the `order` frontmatter field from task prompts.
