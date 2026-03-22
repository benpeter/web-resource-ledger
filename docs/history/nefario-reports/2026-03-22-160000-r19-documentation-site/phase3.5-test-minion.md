# Test-Minion Review: r19-documentation-site

**Verdict: ADVISE**

The plan's rationale for skipping a dedicated test task ("static HTML with no runtime logic") is sound for unit testing, but two specific gaps carry real post-deployment risk.

---

- [testing]: CI has no automated cross-link integrity check — broken internal links will ship silently
  SCOPE: Verification Step 4 ("cross-link integrity") / `deploy-docs.yml`
  CHANGE: Add a post-build step in `deploy-docs.yml` (or as a Task 5 sub-step) that runs `npx broken-link-checker` or a lightweight `find site/_output -name '*.html' | xargs grep -oP 'href="(/[^"]+)"' | sort -u` check against the built output. This catches the common failure mode where a page is renamed but cross-links in other pages still point to the old path.
  WHY: The plan has six pages with bidirectional cross-links authored by user-docs-minion. The build succeeds even if every `href` points at a 404. The verification step says "verify cross-link integrity" but assigns no agent and provides no mechanism — it is a manual intention, not a test. Broken links in developer docs are a trust signal that undermines the whole site.
  TASK: Task 5 (accessibility audit) or Task 4 (CI workflow) — either agent should add this; iac-minion is the better fit since it owns the workflow file.

- [testing]: Lighthouse score >= 90 is a success criterion with no CI enforcement mechanism
  SCOPE: Verification Step 5 / `deploy-docs.yml`
  CHANGE: The plan mentions running `npx lighthouse` post-execution but does not include it in the CI workflow. Task 4's deploy workflow should add a Lighthouse CI step (e.g., `npx lhci autorun`) that runs against the built `site/_output/` using a local server, and fails the workflow if the accessibility score drops below 90. Without this, the score can regress silently on any content or CSS change.
  WHY: The success criterion "Lighthouse accessibility score >= 90" is listed in both the original issue and the verification steps, but nothing enforces it after the initial Task 5 audit. The copy-to-clipboard JS added in Task 5 could introduce an accessibility regression on future changes. One-time audits don't protect against regression.
  TASK: Task 4 (iac-minion owns the CI workflow) — add `lhci` step to `deploy-docs.yml` after the build step, before `wrangler deploy`.

---

**What is already adequate:**

- Build verification (`npm run build` success) is the right primary gate for a static site — this catches template errors, missing data, broken partials, and $ref resolution failures.
- The decision to skip a test-minion execution task is correct. A 15-line clipboard script and static Nunjucks templates do not warrant a Vitest setup.
- The CI docs-skip pattern update (Task 4) correctly prevents false test runs on docs-only changes.
- The accessibility audit in Task 5 is appropriately scoped with concrete WCAG AA contrast ratios and specific HTML structure checks.
