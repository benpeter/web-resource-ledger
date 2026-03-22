// Page-level CSS for the WRL Web UI.
// Uses design system tokens exclusively -- no hardcoded hex values.

export const UI_CSS = `
/* ---------------------------------------------------------------------------
   Reset + base
--------------------------------------------------------------------------- */

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 100%; }

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--color-text);
  background: var(--color-bg);
  min-height: 100vh;
}

/* Prevent iOS zoom on input focus */
input, select, textarea {
  font-size: 1rem;
}

/* ---------------------------------------------------------------------------
   App layout
--------------------------------------------------------------------------- */

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ---------------------------------------------------------------------------
   Navigation bar
--------------------------------------------------------------------------- */

.app-nav {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  min-height: 52px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.nav-link {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-primary);
  text-decoration: none;
  padding: var(--space-2) 0;
  border-bottom: 2px solid transparent;
}

.nav-link:hover {
  color: var(--color-accent);
}

.nav-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.nav-link[aria-current="page"] {
  border-bottom-color: var(--color-primary);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Small ghost button variant for nav */
.btn--sm {
  min-height: 36px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

/* ---------------------------------------------------------------------------
   View container
--------------------------------------------------------------------------- */

.view-container {
  flex: 1;
  padding: var(--space-8) var(--space-4);
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

/* ---------------------------------------------------------------------------
   Auth gate
--------------------------------------------------------------------------- */

.auth-gate {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth-wordmark {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
  letter-spacing: 0.01em;
}

.auth-tagline {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

/* Spacing within the auth form */
#auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ---------------------------------------------------------------------------
   Global error banner (429 etc.)
--------------------------------------------------------------------------- */

.global-error {
  margin-bottom: var(--space-4);
}

/* ---------------------------------------------------------------------------
   Stub view placeholder
--------------------------------------------------------------------------- */

.view-placeholder {
  color: var(--color-text-muted);
  font-size: var(--text-base);
  padding: var(--space-8) 0;
}

/* ---------------------------------------------------------------------------
   Captures view
--------------------------------------------------------------------------- */

.captures-heading {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  color: var(--color-text);
  margin-bottom: var(--space-6);
}

/* Submit form */

.captures-form-section {
  margin-bottom: var(--space-8);
}

.capture-form-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.capture-form-row .input {
  flex: 1;
  min-width: 0;
}

.capture-form-error {
  margin-top: var(--space-2);
}

/* List section */

.captures-list-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.captures-count {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-1);
}

/* Shared column layout for header row and items */

.capture-header-row,
.capture-item {
  display: grid;
  grid-template-columns: 1fr 6rem 6rem;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
}

/* Header row */

.capture-header-row {
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

/* Capture list */

.capture-list {
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  overflow: hidden;
}

/* When there's no header row (empty state) ensure correct border-radius */
.capture-list:first-child {
  border-top: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

/* Individual capture items */

.capture-item {
  color: var(--color-text);
  text-decoration: none;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  transition: background 0.1s;
}

.capture-item:last-child {
  border-bottom: none;
}

.capture-item:hover {
  background: var(--color-surface-muted);
}

.capture-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

/* URL cell: truncate on desktop */
.capture-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  color: var(--color-primary);
}

/* Header URL cell: no truncation */
.capture-header-row .capture-url {
  color: var(--color-text-muted);
  overflow: visible;
  white-space: normal;
}

.capture-time {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.capture-badge {
  display: flex;
  align-items: center;
}

/* Timeout note shown inside item */
.capture-timeout-note {
  grid-column: 1 / -1;
  font-size: var(--text-xs);
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin-top: var(--space-1);
}

/* Empty state and load error */

.capture-empty,
.capture-load-error {
  padding: var(--space-8) var(--space-4);
  font-size: var(--text-base);
  color: var(--color-text-muted);
  text-align: center;
}

.capture-load-error {
  color: var(--color-error-text);
}

/* Load more button */

.captures-more-btn {
  align-self: center;
  margin-top: var(--space-4);
}

/* ---------------------------------------------------------------------------
   Mobile: stacked layout for capture items (<640px)
--------------------------------------------------------------------------- */

@media (max-width: 640px) {
  /* Hide the desktop column header row */
  .capture-header-row {
    display: none;
  }

  /* Border-radius fix when header is hidden */
  .capture-list {
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  /* Stack columns vertically */
  .capture-item {
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    row-gap: var(--space-1);
    padding: var(--space-3);
  }

  /* URL spans full width, wraps */
  .capture-url {
    grid-column: 1 / -1;
    white-space: normal;
    word-break: break-all;
    overflow: visible;
    text-overflow: clip;
  }

  /* Time and badge on second row */
  .capture-time {
    grid-row: 2;
    grid-column: 1;
  }

  .capture-badge {
    grid-row: 2;
    grid-column: 2;
    justify-self: end;
  }

  /* Form row stacks on small screens */
  .capture-form-row {
    flex-direction: column;
  }

  .capture-form-row .btn {
    width: 100%;
  }
}

/* ---------------------------------------------------------------------------
   Responsive -- mobile-first
--------------------------------------------------------------------------- */

@media (max-width: 600px) {
  .app-nav {
    padding: var(--space-2) var(--space-3);
  }

  .view-container {
    padding: var(--space-4) var(--space-3);
  }

  .auth-card {
    padding: var(--space-6) var(--space-4);
  }
}

/* Nav stacks vertically on very small screens */
@media (max-width: 420px) {
  .app-nav {
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-3);
  }

  .nav-actions {
    align-self: flex-end;
  }
}

/* ---------------------------------------------------------------------------
   Reduced motion
--------------------------------------------------------------------------- */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
`;
