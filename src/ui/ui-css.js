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
