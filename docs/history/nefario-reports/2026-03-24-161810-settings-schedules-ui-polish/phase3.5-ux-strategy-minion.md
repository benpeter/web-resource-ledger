ADVISE

- [usability]: Plan adds `.settings-scope-item` CSS rule (correct — used by JS) but an existing `.settings-scope-label` class rule in ui-css.js (line 738) is functionally dead — the JS only uses `settings-scope-label` as an id, never as a className. The two rules have near-identical properties, which will confuse future maintainers reading the CSS.
  SCOPE: `src/ui/ui-css.js` — `.settings-scope-label` rule (line 738)
  CHANGE: While adding `.settings-scope-item`, also remove (or repurpose) the dead `.settings-scope-label` CSS class rule. It was presumably meant for `.settings-scope-item` but was written with the wrong name.
  WHY: Dead CSS accumulates maintenance debt. When both rules coexist with near-identical properties, the next developer will not know which one is authoritative — violating Nielsen's consistency heuristic as it applies to the codebase as a mental model. This is a low-effort fix best bundled with Task 1, since Task 1 already addresses the analogous `.settings-section-title` dead rule.
  TASK: Task 1
