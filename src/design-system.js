// tva
// Design system CSS -- source of truth is src/design-system.css
// Update this file when design-system.css changes.
export const DESIGN_SYSTEM_CSS = `
/* WRL Design System */

/* 1. Tokens */
:root {
  /* Neutrals */
  --color-text: #1e2a36;
  --color-text-muted: #6e6a66;
  --color-bg: #f7f6f5;
  --color-surface: #ffffff;
  --color-surface-muted: #f3f2f0;
  --color-border: #dddbd8;
  --color-border-subtle: #ece9e6;

  /* Brand */
  --color-primary: #2a3444;
  --color-primary-hover: #1f2835;
  --color-primary-text: #f8f8fa;
  --color-secondary: #5a6577;
  --color-secondary-hover: #4d5768;
  --color-secondary-text: #f8f8fa;

  /* Semantic */
  --color-success: #2e7d32;
  --color-success-bg: #e8f5e9;
  --color-success-text: #1b5e20;
  --color-error: #c62828;
  --color-error-bg: #ffebee;
  --color-error-text: #b71c1c;
  --color-warning: #e6a817;
  --color-warning-bg: #fff8e1;
  --color-warning-text: #7a5800;
  --color-info: #1565c0;
  --color-info-bg: #e3f2fd;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.6;
  --weight-normal: 400;
  --weight-medium: 600;
  --weight-bold: 700;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Shape */
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
}

/* 2. Components */

/* Buttons */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: var(--space-2) var(--space-5);
  font-family: var(--font-sans); font-size: var(--text-base); font-weight: var(--weight-medium);
  border: 1px solid transparent; border-radius: var(--radius-md);
  cursor: pointer; text-decoration: none; line-height: var(--leading-tight);
}
.btn:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.btn--primary {
  background: var(--color-primary); color: var(--color-primary-text); border-color: var(--color-primary);
}
.btn--primary:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }
.btn--secondary {
  background: var(--color-secondary); color: var(--color-secondary-text); border-color: var(--color-secondary);
}
.btn--secondary:hover { background: var(--color-secondary-hover); border-color: var(--color-secondary-hover); }
.btn--ghost { background: transparent; color: var(--color-primary); border-color: var(--color-border); }
.btn--ghost:hover { background: var(--color-surface-muted); }

/* Alerts */
.alert {
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
}
.alert--success { border-color: var(--color-success); background: var(--color-success-bg); color: var(--color-success-text); }
.alert--error   { border-color: var(--color-error);   background: var(--color-error-bg);   color: var(--color-error-text); }
.alert--warning { border-color: var(--color-warning); background: var(--color-warning-bg); color: var(--color-warning-text); }
.alert--info    { border-color: var(--color-info);    background: var(--color-info-bg);    color: var(--color-text); }

/* Badges */
.badge {
  display: inline-block; padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs); font-weight: var(--weight-medium);
  border-radius: var(--radius-sm); line-height: var(--leading-tight);
  border: 1px solid transparent;
}
.badge--pass { background: var(--color-success-bg); color: var(--color-success-text); border-color: var(--color-success); }
.badge--fail { background: var(--color-error-bg);   color: var(--color-error-text);   border-color: var(--color-error); }
.badge--skip { background: var(--color-surface-muted); color: var(--color-text-muted); border-color: var(--color-border); }

/* Card */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* Banner */
.banner { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3) var(--space-4); }
.banner--verified { background: var(--color-success-bg); color: var(--color-success-text); }
.banner--failed   { background: var(--color-error-bg);   color: var(--color-error-text); }

/* Section */
.section { border-top: 1px solid var(--color-border); padding: var(--space-6) 0; }
.section h2 {
  font-size: var(--text-xs); font-weight: var(--weight-medium);
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}

/* Check list */
.check-list { list-style: none; margin: 0; padding: 0; }
.check-item {
  display: flex; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border-subtle);
}

/* Code block */
.code-block {
  font-family: var(--font-mono); font-size: var(--text-sm);
  background: var(--color-surface-muted); border: 1px solid var(--color-border);
  border-radius: var(--radius-md); padding: var(--space-3) var(--space-4);
  overflow-x: auto; white-space: pre;
}

/* Disclosure */
.disclosure { border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.disclosure summary {
  padding: var(--space-3) var(--space-4); cursor: pointer;
  font-weight: var(--weight-medium); font-size: var(--text-base); list-style: none;
}
.disclosure summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* Data grid */
.data-grid { display: grid; gap: var(--space-2) var(--space-4); }
.data-row  { display: contents; }
.data-label {
  font-size: var(--text-xs); font-weight: var(--weight-medium);
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);
}
.data-value { font-size: var(--text-base); color: var(--color-text); }

/* Input */
.input {
  display: block; width: 100%; padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans); font-size: var(--text-base);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface); color: var(--color-text);
}
.input:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-color: var(--color-primary); }
.input--error { border-color: var(--color-error); }

/* Table */
.table { width: 100%; border-collapse: collapse; font-size: var(--text-base); }
.table th {
  background: var(--color-surface-muted); font-weight: var(--weight-medium);
  font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em;
  padding: var(--space-2) var(--space-3); text-align: left;
}
.table td { padding: var(--space-3); border-bottom: 1px solid var(--color-border-subtle); }

/* 3. Utilities */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
}
.text-mono  { font-family: var(--font-mono); }
.text-muted { color: var(--color-text-muted); }
.text-break { word-break: break-all; }

/* 4. Responsive + Motion */
@media (max-width: 640px) {
  .btn { padding: var(--space-2) var(--space-4); }
  .alert, .banner { padding: var(--space-2) var(--space-3); }
  .section { padding: var(--space-4) 0; }
  .card { border-radius: var(--radius-md); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
`;
