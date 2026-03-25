# Process: UI/UX Fixes Batch (#213)

## TL;DR

Four UI/UX fixes delivered in a single nefario orchestration: WCAG contrast fix (design token change), billing status dedup (5-line removal), docs nav link (22 lines + CSS + guard), and Coralogix alert documentation (zero code). Two execution agents ran in parallel, producing 188 lines of changes across 11 files. All 1519 tests pass. The key architectural insight was that the reported "Sign In button contrast" issue was actually a design token problem affecting all muted text — confirmed independently by all four planning specialists.

## Phase 1: Meta-Plan

Nefario identified four planning specialists:
- **frontend-minion**: Contrast investigation, billing DOM analysis, nav link placement
- **iac-minion**: Notification infrastructure (Coralogix vs email pipeline)
- **ux-strategy-minion**: Docs link placement strategy, cognitive load analysis
- **test-minion**: Test coverage plan for all four fixes

No second-round specialists were needed.

## Phase 2: Specialist Planning

### The Contrast Debate (Resolved: Consensus)

All specialists independently reached the same conclusion: the `.btn--github` button has 10.5:1 contrast and is NOT the problem. The issue is `--color-text-muted` (#6e6a66), used for tagline, divider, and label text, which fails WCAG AA.

Frontend-minion proposed `#5c5855`. The synthesis adjusted to `#595550` for a larger safety margin. Accessibility-minion later calculated the precise ratios: 6.85:1 against #f7f6f5, 7.39:1 against #ffffff.

Accessibility-minion also noted that the original contrast ratio was ~4.97:1, not ~3.4:1 as stated in the synthesis (which used a different calculation method). The fix is still correct and beneficial regardless.

### Docs Link Placement (Resolved: UX Strategy Won)

Frontend-minion initially proposed adding the docs link to `navLinks` (left side, after Settings). UX-strategy-minion argued for `navActions` (right side, before username/sign-out), reasoning that docs is a utility/support action, not a primary workflow destination. Adding to navLinks would inflate the primary nav to 6 items for session users.

Synthesis sided with ux-strategy-minion. The reasoning: Hick's Law — more items in the primary nav increases scan time for actions users take frequently. Docs is an interrupt-driven lookup, not a daily workflow.

### Notification Approach (Resolved: Zero Code Wins)

Frontend-minion had no opinion (backend concern). Iac-minion argued convincingly for a Coralogix alert on the existing `admin.key_create` log event — zero code changes. The alternative (dispatchNotification via Resend) would have required ~40 lines of new code, a new email template, and misused the tenant-facing email infrastructure for operator notifications.

Margo (Phase 3.5) explicitly approved this as proportional. Test-minion's original plan included tests for the notification code change — these were correctly dropped when the zero-code approach was selected.

### Ghost Button Border (Deferred)

Frontend-minion identified that `.btn--ghost` border contrast (~1.6:1 against white) fails WCAG 2.2 non-text contrast. Proposed `--color-border-interactive` token. Synthesis deferred this — `--color-border` is global (cards, tables, inputs, dividers), and adding a new token increases surface area. Margo would have blocked it as scope creep.

## Phase 3: Synthesis

Produced a two-task parallel execution plan:
- Task 1 (frontend-minion): All three UI fixes + regression tests
- Task 2 (iac-minion): Coralogix alert documentation

No approval gates. No sequential dependencies.

## Phase 3.5: Architecture Review (6 Reviewers)

**Verdicts**: 1 APPROVE (margo), 5 ADVISE (security, test, ux-strategy, lucy, accessibility), 0 BLOCK.

### Key Advisories Incorporated

1. **Security-minion**: `updateNavCurrent()` iterates all `.nav-link` elements assuming hash routes. External docs link needs a guard: `if (linkPath.startsWith('http')) continue;`. Also ensure both `nav-link` and `nav-link--external` classes on the element.

2. **Test-minion**: Three regression tests needed — billing dedup guard (string assertion that buildRefreshRow doesn't contain 'Status:'), design token sync (both CSS and JS contain #595550), docs link presence (AUTH_JS contains docs.webresourceledger.com and "opens in new tab").

3. **UX-strategy-minion**: The `.sr-only` screen reader text span MUST be a child of the `<a>` element, not a sibling. Sibling spans aren't announced when the link receives focus.

4. **Accessibility-minion**: Contrast ratios in documentation should be corrected (original was ~4.97:1, not ~3.4:1). New value gives 6.85:1 / 7.39:1.

5. **Lucy**: Evolution log is mandatory per CLAUDE.md. Handled by the calling session.

All advisories were folded into the Task 1 execution prompt.

## Phase 4: Execution

Both agents ran in parallel. Frontend-minion completed in ~3.5 minutes, iac-minion in ~2.5 minutes. All 1519 tests passed on the first run — no fix iterations needed.

Iac-minion went beyond the plan by updating `scripts/provision-alerts.sh` in addition to the ops docs. This was a good call — the project already has an alert provisioning script, and the new alert belongs there.

## Human Interventions

This was an autonomous orchestration — no human intervention at any gate. Lucy served as the gate decision-maker throughout:
- Team approval: APPROVE (4 specialists)
- Reviewer approval: APPROVE (5 mandatory + accessibility-minion)
- Execution plan: APPROVE
- Post-execution: "Run all"

## Where to Read More

- **Specialist contributions**: `docs/history/nefario-reports/` (companion directory for this run)
- **Synthesis (final plan)**: See the companion directory's `phase3-synthesis.md`
- **Review verdicts**: See the companion directory's `phase3.5-*.md` files
- **Evolution log**: This directory (`docs/evolution/0080-ui-ux-fixes-batch/`)
