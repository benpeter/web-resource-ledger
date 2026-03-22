# Margo: Complexity Review

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. It follows established codebase patterns (verify-page.js as the template), uses zero external dependencies, vanilla JS/CSS/HTML throughout, and makes sensible architectural choices (hash routing avoiding Worker-side changes, sessionStorage over localStorage, combined view eliminating unnecessary navigation). The decisions section shows genuine trade-off reasoning with YAGNI applied correctly (no hasWacz API change, no verify-page.js refactoring, E2E tests deferred). The four-task sequential structure is straightforward.

Two items worth watching:

- [simplicity]: Seven files for three views plus a shell is at the upper bound of justified decomposition for inline-JS string modules.
  SCOPE: `src/ui/` file structure -- specifically `ui-poll.js` and `ui-css.js` as separate files
  CHANGE: Consider whether `ui-poll.js` (a single `startPolling` function, ~30 lines) justifies its own file, or whether it belongs inline in `ui-list.js` where it is consumed. Similarly, `ui-css.js` as a separate file from `ui-shell.js` adds a module boundary where the shell is already the only consumer. If the implementer finds the content is small enough, collapsing either into its parent is acceptable. This is not a directive to change the plan -- it is permission for the implementer to simplify if the natural size of the code warrants it.
  WHY: Each file in this architecture is a JS string constant imported by the shell and concatenated into a single `<script>` block. The module boundary exists at build-time (Worker code organization) but disappears at runtime (it is all one string). If a module is ~30 lines, the organizational cost of the separate file (import, export, naming, mental bookkeeping) approaches the cost of the code itself. The plan correctly rejected a single monolithic file (verify-page.js at ~690 lines is the evidence), but seven files for ~1500 lines of total JS output is the other end of the spectrum.
  TASK: Tasks 1, 2

- [simplicity]: The responsive table-to-cards layout switch (desktop table, mobile cards) in Task 2 implies rendering two different DOM structures for the same data.
  SCOPE: `src/ui/ui-list.js` -- desktop table vs. mobile card layout
  CHANGE: Consider using a single semantic structure (e.g., a list of cards that visually resembles a table on wider viewports via CSS grid) rather than rendering two separate DOM structures and toggling visibility with media queries. A single structure styled responsively is simpler to build, maintain, and keep in sync. If the implementer finds the CSS-only approach insufficient for the desired visual outcome, the dual-structure approach is acceptable, but the CSS-only approach should be attempted first.
  WHY: Two DOM structures for the same data means two code paths for event handlers, two structures to update when polling completes, and two structures to keep in sync for "Load more" pagination. A single structure with responsive CSS eliminates this duplication. The design system already has both `.table` and `.card` components, but using one underlying structure styled to look like either is less code and fewer bugs.
  TASK: Task 2

Everything else checks out. The plan is disciplined about scope (no sorting, no filtering, no thumbnails in list, no admin features), honest about trade-offs (DevTools line numbers, no source maps), and proportional in complexity to the three-view UI being built. No dependency additions. No framework adoption. No premature optimization. The complexity budget is well within bounds for what is essentially one new Worker route returning HTML with inline JS/CSS.
