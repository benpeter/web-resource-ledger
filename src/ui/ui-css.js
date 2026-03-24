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

/* "Scheduled" label shown on captures that belong to a schedule */
.capture-scheduled-label {
  display: inline-block;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-info-bg);
  color: var(--color-info-text);
  margin-left: var(--space-2);
  vertical-align: middle;
  white-space: nowrap;
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
   Loading spinner
--------------------------------------------------------------------------- */

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: var(--space-4) auto;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ---------------------------------------------------------------------------
   Login view -- GitHub OAuth + API key fallback
--------------------------------------------------------------------------- */

.btn--github {
  background: var(--color-primary);
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  gap: var(--space-2);
  width: 100%;
  justify-content: center;
}

.btn--github:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.login-github-section {
  margin-top: var(--space-2);
}

.login-divider {
  position: relative;
  display: flex;
  align-items: center;
  margin: var(--space-2) 0;
}

.login-divider-line {
  flex: 1;
  height: 1px;
  background: var(--color-border);
}

.login-divider-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-surface);
  padding: 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.login-apikey-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.login-apikey-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-weight: var(--weight-medium);
}

/* ---------------------------------------------------------------------------
   Welcome view -- first-key display
--------------------------------------------------------------------------- */

.welcome-card {
  max-width: 480px;
}

.welcome-heading {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

.welcome-subtitle {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.welcome-warning {
  margin: var(--space-2) 0;
}

.welcome-key-area,
.welcome-key-section {
  margin: var(--space-2) 0;
}

.welcome-key-row {
  display: flex;
  gap: var(--space-2);
  align-items: stretch;
}

.welcome-key-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.welcome-loading {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.welcome-no-key,
.welcome-error {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.welcome-error a,
.welcome-no-key a {
  color: var(--color-accent);
}

/* ---------------------------------------------------------------------------
   ToS gate
--------------------------------------------------------------------------- */

.tos-gate {
  max-width: 480px;
}

.tos-heading {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

.tos-description {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

.tos-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.tos-checkbox {
  margin-top: 0.2em;
  flex-shrink: 0;
}

.tos-check-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  cursor: pointer;
}

.tos-label-text,
.tos-label {
  font-size: var(--text-base);
  color: var(--color-text);
  line-height: var(--leading-normal);
}

.tos-label a,
.tos-label-text a {
  color: var(--color-accent);
}

.tos-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.tos-error {
  margin-top: var(--space-2);
}

/* aria-disabled styling */
[aria-disabled="true"] {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---------------------------------------------------------------------------
   Settings view
--------------------------------------------------------------------------- */

.settings-section {
  margin-bottom: var(--space-8);
}

.settings-section-title {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}

.settings-info-grid {
  grid-template-columns: 8rem 1fr;
}

.settings-keys-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.settings-keys-count {
  font-size: var(--text-sm);
}

.settings-keys-table {
  margin-bottom: var(--space-4);
}

.settings-revoke-btn {
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
}

.settings-confirm {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: var(--color-warning-bg);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.settings-confirm-text {
  font-size: var(--text-sm);
  color: var(--color-warning-text);
  flex: 1;
  min-width: 200px;
}

.settings-confirm-revoke {
  background: var(--color-error);
  color: var(--color-error-bg);
  border-color: var(--color-error);
}

.settings-create-btn {
  margin-top: var(--space-4);
}

.settings-create-form {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.settings-create-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
}

.settings-create-input {
  margin-top: var(--space-1);
}

.settings-create-scopes {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-create-scopes legend {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
  margin-bottom: var(--space-1);
}

.settings-scope-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-base);
  cursor: pointer;
}

.scope-badge {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-sm);
  background: var(--color-info-bg);
  color: var(--color-info-text);
  margin-right: var(--space-1);
}

/* Nav username */
.nav-username {
  font-size: var(--text-sm);
  padding: var(--space-1) 0;
}

/* Copied feedback */
.copied-feedback {
  color: var(--color-success-text);
}

/* ---------------------------------------------------------------------------
   Add-ons section
--------------------------------------------------------------------------- */

.settings-addon-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}

.settings-addon-toggle-label {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
}

.settings-addon-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-addon-label {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--color-text);
}

.settings-addon-description {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
}

.settings-addon-cost {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.settings-addon-confirm {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--color-warning-bg);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.settings-addon-billing-link {
  color: var(--color-accent);
}

/* Toggle switch -- native checkbox styled as a sliding pill */

.settings-toggle {
  appearance: none;
  -webkit-appearance: none;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  background: var(--color-border);
  border-radius: 11px;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease;
  margin-top: 2px;
}

.settings-toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: var(--color-surface);
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.settings-toggle:checked {
  background: var(--color-primary);
}

.settings-toggle:checked::after {
  transform: translateX(18px);
}

.settings-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.settings-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .settings-toggle,
  .settings-toggle::after {
    transition: none;
  }
}

/* ---------------------------------------------------------------------------
   Usage section
--------------------------------------------------------------------------- */

.usage-metric { margin-bottom: var(--space-4); }
.usage-metric:last-of-type { margin-bottom: 0; }
.usage-metric-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-1);
}
.usage-metric-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-muted);
}
.usage-metric-value {
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
}
.usage-bar {
  height: 8px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
}
.usage-bar-fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-sm);
  transition: width 0.2s ease;
  min-width: 0;
}
.usage-bar-fill--warning { background: var(--color-warning); }
.usage-bar-fill--critical { background: var(--color-error); }
.usage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.usage-refresh-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 8px;
  font-size: var(--text-sm);
}
.usage-refresh-btn:hover {
  background: var(--color-surface-muted);
  color: var(--color-text);
}

/* ---------------------------------------------------------------------------
   Schedules view
--------------------------------------------------------------------------- */

.schedule-form-section {
  margin-bottom: var(--space-4);
}

.schedule-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.schedule-field-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-muted);
  margin-bottom: var(--space-1);
}

.schedule-form-preview {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  margin-top: calc(-1 * var(--space-1));
}

/* Shared column layout for header row and items */

.schedule-header-row,
.schedule-item {
  display: grid;
  grid-template-columns: 1fr 10rem 10rem 12rem;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-4);
}

/* Header row */

.schedule-header-row {
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

/* Schedule list */

.schedule-list {
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  overflow: hidden;
}

.schedule-list:first-child {
  border-top: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

/* Individual schedule rows */

.schedule-item {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-subtle);
}

.schedule-item:last-child {
  border-bottom: none;
}

/* URL cell: stacked URL + name */

.schedule-url-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow: hidden;
}

.schedule-url-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  color: var(--color-primary);
}

.schedule-name-text {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-col-freq,
.schedule-col-next {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}

/* Actions cell */

.schedule-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* Mobile: stacked layout (<640px) */

@media (max-width: 640px) {
  .schedule-header-row {
    display: none;
  }

  .schedule-list {
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .schedule-item {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto auto;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .schedule-col-url {
    grid-column: 1;
  }

  .schedule-col-freq,
  .schedule-col-next {
    white-space: normal;
  }

  .schedule-actions {
    flex-wrap: wrap;
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

  .loading-spinner {
    animation: none;
    border: none;
    width: auto;
    height: auto;
  }
  .loading-spinner::before {
    content: "Loading...";
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
}

/* ---------------------------------------------------------------------------
   Detail view
--------------------------------------------------------------------------- */

.detail-back-link {
  display: inline-block;
  font-size: var(--text-sm);
  color: var(--color-accent);
  text-decoration: none;
  margin-bottom: var(--space-4);
}

.detail-back-link:hover {
  text-decoration: underline;
}

.detail-back-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Status banner */

.detail-status-banner {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  display: flex;
  align-items: center;
}

.detail-status-banner--complete {
  background: var(--color-success-bg);
  border-left: 4px solid var(--color-success);
}

.detail-status-banner--failed {
  background: var(--color-error-bg);
  border-left: 4px solid var(--color-error);
}

.detail-status-banner--pending {
  background: var(--color-surface-muted);
  border-left: 4px solid var(--color-border);
}

.detail-status-label {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
}

.detail-status-banner--complete .detail-status-label {
  color: var(--color-success-text);
}

.detail-status-banner--failed .detail-status-label {
  color: var(--color-error-text);
}

.detail-status-banner--pending .detail-status-label {
  color: var(--color-text-muted);
}

/* Card */

.detail-card {
  padding: 0;
}

.detail-section {
  padding: var(--space-6) var(--space-6);
}

/* Data grid two-column layout */

.detail-data-grid {
  grid-template-columns: 8rem 1fr;
}

.detail-url-link {
  color: var(--color-accent);
  text-decoration: none;
}

.detail-url-link:hover {
  text-decoration: underline;
}

.detail-url-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Screenshots */

.detail-screenshot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.detail-screenshot-figure {
  margin: 0;
}

.detail-screenshot-img {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.detail-screenshot-caption {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-2);
}

/* Artifact links */

.detail-artifact-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.detail-artifact-link {
  font-size: var(--text-base);
  color: var(--color-accent);
  text-decoration: none;
}

.detail-artifact-link:hover {
  text-decoration: underline;
}

.detail-artifact-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.detail-artifact-cert {
  margin-top: var(--space-2);
}
.detail-artifact-cert .btn--ghost {
  font-size: var(--font-size-sm);
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

/* Verification link */

.detail-verify-link {
  font-size: var(--text-base);
  color: var(--color-accent);
  text-decoration: none;
}

.detail-verify-link:hover {
  text-decoration: underline;
}

.detail-verify-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Polling row */

.detail-poll-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.detail-poll-label {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

/* Spinner (reused for loading + polling) */

.detail-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-text-muted);
  border-radius: 50%;
  animation: detail-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes detail-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .detail-spinner {
    animation: none;
    border: none;
    width: auto;
    height: auto;
  }
  .detail-spinner::before {
    content: "...";
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
}

/* Loading state */

.detail-loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-8) 0;
}

.detail-loading-text {
  font-size: var(--text-base);
  color: var(--color-text-muted);
}

/* Not found / error */

.detail-not-found,
.detail-retry-btn {
  margin-top: var(--space-4);
}

.detail-retry-btn {
  display: inline-flex;
}

/* Mobile: screenshots stack, data grid single column */

@media (max-width: 640px) {
  .detail-screenshot-grid {
    grid-template-columns: 1fr;
  }

  .detail-data-grid {
    grid-template-columns: 1fr;
  }

  .detail-section {
    padding: var(--space-4) var(--space-4);
  }
}

/* ---------------------------------------------------------------------------
   Billing tab
--------------------------------------------------------------------------- */

.billing-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.billing-stat {
  text-align: center;
}
.billing-stat-value {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--color-text);
}
.billing-stat-label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}

.billing-tier-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.billing-tier-table th {
  text-align: left;
  font-weight: var(--weight-medium);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
}
.billing-tier-table td {
  padding: var(--space-1) var(--space-2);
}
.billing-tier-active {
  background: var(--color-info-bg);
}

.billing-status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}
.billing-status-badge--active {
  background: var(--color-success-bg);
  color: var(--color-success-text);
}
.billing-status-badge--none {
  background: var(--color-info-bg);
  color: var(--color-info-text);
}

/* Billing: mobile layout */
@media (max-width: 640px) {
  .billing-stats-row {
    grid-template-columns: 1fr;
    gap: var(--space-2);
  }
  .billing-stat {
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .billing-tier-table thead { display: none; }
  .billing-tier-table tr {
    display: block;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .billing-tier-table td {
    display: block;
    padding: var(--space-1) 0;
  }
  .billing-tier-table td::before {
    content: attr(data-label);
    font-weight: var(--weight-medium);
    color: var(--color-text-muted);
    margin-right: var(--space-2);
  }
}
`;
